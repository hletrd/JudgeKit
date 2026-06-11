import { NextRequest } from "next/server";
import { extractClientIp } from "@/lib/security/ip";
import { nanoid } from "nanoid";
import { z } from "zod";
import { createApiHandler } from "@/lib/api/handler";
import { apiSuccess, apiError } from "@/lib/api/responses";
import { db } from "@/lib/db";
import { rawQueryAll, rawQueryOne } from "@/lib/db/queries";
import { antiCheatEvents, users } from "@/lib/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { parsePositiveInt, parseNonNegativeInt } from "@/lib/validators/query-params";
import { getContestAssignment, canMonitorContest } from "@/lib/assignments/contests";
import { getExamSession } from "@/lib/assignments/exam-sessions";
import { getEffectiveExamCloseAt } from "@/lib/assignments/exam-close";
import { LRUCache } from "lru-cache";
import { getUnsupportedRealtimeGuard, shouldRecordSharedHeartbeat, usesSharedRealtimeCoordination } from "@/lib/realtime/realtime-coordination";
// Canonical client-event vocabulary lives in lib (RPF cycle-4 AGG4-7) so the
// submission validator's freshness probe can share it; the zod schema below
// still rejects server-originated event classes (ip_change, code_similarity,
// submission_stale_heartbeat) from contestant POSTs.
import { CLIENT_EVENT_TYPES } from "@/lib/anti-cheat/client-events";

/** last heartbeat insert time per "assignmentId:userId" — only insert once per 60s */
const lastHeartbeatTime = new LRUCache<string, number>({ max: 10_000, ttl: 120_000 });

const antiCheatEventSchema = z.object({
  eventType: z.enum(CLIENT_EVENT_TYPES),
  details: z.string().max(500).optional(),
});

/** POST: Log an anti-cheat event (student-facing, rate-limited) */
export const POST = createApiHandler({
  rateLimit: "anti-cheat:log",
  schema: antiCheatEventSchema,
  handler: async (req: NextRequest, { user, body, params }) => {
    const realtimeGuard = getUnsupportedRealtimeGuard("/api/v1/contests/[assignmentId]/anti-cheat");
    if (realtimeGuard) {
      return apiError(realtimeGuard.error, 503);
    }

    const { assignmentId } = params;
    const assignment = await getContestAssignment(assignmentId);

    if (!assignment || assignment.examMode === "none") {
      return apiError("notFound", 404);
    }

    if (!assignment.enableAntiCheat) {
      // Anti-cheat not enabled, silently accept without further checks
      return apiSuccess({ logged: false });
    }

    // SEC M-8: stricter origin check than the global CSRF helper.
    // CSRF.validateCsrf only rejects when Origin IS PRESENT and mismatches;
    // a curl client that simply omits Origin still passes. For anti-cheat
    // we REQUIRE the Origin header to be present and to match the
    // deployment's canonical host. This makes the scripted bypass
    // ("curl every 30s while a confederate handles the exam") meaningfully
    // harder — the attacker now has to spoof the browser environment
    // closely enough to pin Origin.
    if (process.env.NODE_ENV === "production") {
      const originHeader = req.headers.get("origin")?.trim();
      if (!originHeader) {
        return apiError("forbidden", 403);
      }
      const { getAuthUrlObject } = await import("@/lib/security/env");
      const expectedHost = getAuthUrlObject()?.host;
      if (expectedHost) {
        try {
          if (new URL(originHeader).host !== expectedHost) {
            return apiError("forbidden", 403);
          }
        } catch {
          return apiError("forbidden", 403);
        }
      }
    }

    // Verify user has access to this contest
    const hasAccess = await rawQueryOne(
      `SELECT 1 FROM enrollments WHERE group_id = @groupId AND user_id = @userId
       UNION ALL
       SELECT 1 FROM contest_access_tokens WHERE assignment_id = @assignmentId AND user_id = @userId AND (expires_at IS NULL OR expires_at > NOW())
       LIMIT 1`,
      { groupId: assignment.groupId, userId: user.id, assignmentId }
    );
    if (!hasAccess) {
      return apiError("forbidden", 403);
    }

    // Use DB server time for contest boundary checks to avoid clock skew
    const nowRow = await rawQueryOne<{ now: Date }>("SELECT NOW()::timestamptz AS now");
    if (!nowRow?.now) {
      return apiError("internalServerError", 500);
    }
    const now = nowRow.now;
    if (assignment.startsAt && now < assignment.startsAt) {
      return apiError("contestNotStarted", 403);
    }
    if (assignment.deadline && now > assignment.deadline) {
      // RPF cycle-3 AGG3-1: a staff-granted extension (extendExamSession) may
      // move a windowed-exam participant's personal_deadline PAST the
      // assignment close — submissions already honor it, so telemetry must
      // too, or the accommodation window goes dark and every submission in it
      // accrues a false `submission_stale_heartbeat` flag. The session lookup
      // runs ONLY on this past-close branch (hot path stays query-free).
      let effectiveClose: Date | null = assignment.deadline;
      if (assignment.examMode === "windowed") {
        const examSession = await getExamSession(assignmentId, user.id);
        effectiveClose = getEffectiveExamCloseAt(
          assignment,
          examSession?.personalDeadline ?? null
        );
      }
      // null = no close (unreachable here — deadline is non-null on this branch).
      if (effectiveClose && now > effectiveClose) {
        return apiError("contestEnded", 403);
      }
    }

    const { eventType, details: rawDetails } = body;
    // Store the client's details string directly — no double-encoding.
    // The client already JSON.stringifies structured data before sending.
    const details = rawDetails ?? null;

    // Heartbeat events: only insert a DB row once per 60 seconds to reduce churn.
    if (eventType === "heartbeat") {
      let shouldRecord = false;
      if (usesSharedRealtimeCoordination()) {
        shouldRecord = await shouldRecordSharedHeartbeat({ assignmentId, userId: user.id });
      } else {
        const heartbeatKey = `${assignmentId}:${user.id}`;
        // Use DB server time for dedup to stay consistent with the `createdAt`
        // timestamp (line ~110) and contest boundary checks above (lines 63-73).
        // Using Date.now() would cause clock-skew mismatches between the
        // in-memory dedup state and the authoritative DB timestamps.
        const nowMs = now.getTime();
        const last = lastHeartbeatTime.get(heartbeatKey) ?? 0;
        if (nowMs - last >= 60_000) {
          lastHeartbeatTime.set(heartbeatKey, nowMs);
          shouldRecord = true;
        }
      }

      if (shouldRecord) {
        await db.insert(antiCheatEvents)
          .values({
            id: nanoid(),
            assignmentId,
            userId: user.id,
            eventType: "heartbeat",
            details: null,
            ipAddress: extractClientIp(req.headers),
            userAgent: null,
            createdAt: now,
          });
      }
      return apiSuccess({ logged: true });
    }

    const ip = extractClientIp(req.headers);
    const userAgent = req.headers.get("user-agent") ?? null;

    await db.insert(antiCheatEvents)
      .values({
        id: nanoid(),
        assignmentId,
        userId: user.id,
        eventType,
        details,
        ipAddress: ip,
        userAgent,
        createdAt: now,
      });

    return apiSuccess({ logged: true });
  },
});

/** GET: Fetch anti-cheat events (instructor+, paginated) */
export const GET = createApiHandler({
  rateLimit: "anti-cheat:view",
  handler: async (req: NextRequest, { user, params }) => {
    const { assignmentId } = params;
    const assignment = await getContestAssignment(assignmentId);

    if (!assignment || assignment.examMode === "none") {
      return apiError("notFound", 404);
    }

    // Read-only monitoring surface: extend to group TAs so a teaching
    // assistant can supervise a live exam without inheriting write
    // power. Write semantics (e.g., the POST heartbeat) keep
    // canManageContest above.
    const canView = await canMonitorContest(user, assignment);

    if (!canView) {
      return apiError("forbidden", 403);
    }

    const searchParams = req.nextUrl.searchParams;

    // IP-overlap report (RPF cycle-1 AGG-6/PS1): the IPs were always captured
    // (exam_sessions.ip_address + per-event IPs) but never correlated, so
    // duplicate-account / shared-seat collusion hunting meant eyeballing
    // hundreds of rows. Read-only aggregation over data staff already see
    // per-row; no new collection.
    if (searchParams.get("report") === "ipOverlap") {
      const ipUserCte = `
        WITH ip_user AS (
          SELECT DISTINCT ip_address AS ip, user_id
            FROM anti_cheat_events
           WHERE assignment_id = @assignmentId AND ip_address IS NOT NULL
          UNION
          SELECT DISTINCT ip_address AS ip, user_id
            FROM exam_sessions
           WHERE assignment_id = @assignmentId AND ip_address IS NOT NULL
        )`;
      const [sharedIps, multiIpUsers] = await Promise.all([
        rawQueryAll<{ ip: string; users: Array<{ id: string; name: string; username: string }> }>(
          `${ipUserCte}
           SELECT iu.ip,
                  json_agg(json_build_object('id', u.id, 'name', u.name, 'username', u.username) ORDER BY u.username) AS users
             FROM ip_user iu
             JOIN users u ON u.id = iu.user_id
            GROUP BY iu.ip
           HAVING COUNT(DISTINCT iu.user_id) > 1
            ORDER BY COUNT(DISTINCT iu.user_id) DESC, iu.ip
            LIMIT 100`,
          { assignmentId }
        ),
        rawQueryAll<{ userId: string; name: string; username: string; ipCount: number; ips: string[] }>(
          `${ipUserCte}
           SELECT u.id AS "userId", u.name, u.username,
                  COUNT(DISTINCT iu.ip)::int AS "ipCount",
                  array_agg(DISTINCT iu.ip) AS ips
             FROM ip_user iu
             JOIN users u ON u.id = iu.user_id
            GROUP BY u.id, u.name, u.username
           HAVING COUNT(DISTINCT iu.ip) > 2
            ORDER BY COUNT(DISTINCT iu.ip) DESC, u.username
            LIMIT 100`,
          { assignmentId }
        ),
      ]);
      return apiSuccess({ sharedIps, multiIpUsers });
    }

    const userIdFilter = searchParams.get("userId");
    const eventTypeFilter = searchParams.get("eventType");
    const limit = Math.min(parsePositiveInt(searchParams.get("limit"), 100), 500);
    const offset = parseNonNegativeInt(searchParams.get("offset"), 0);

    // Build filters using Drizzle
    const filters = [eq(antiCheatEvents.assignmentId, assignmentId)];
    if (userIdFilter) filters.push(eq(antiCheatEvents.userId, userIdFilter));
    if (eventTypeFilter) filters.push(eq(antiCheatEvents.eventType, eventTypeFilter));
    const whereClause = and(...filters);

    const events = await db
      .select({
        id: antiCheatEvents.id,
        userId: antiCheatEvents.userId,
        userName: users.name,
        username: users.username,
        eventType: antiCheatEvents.eventType,
        details: antiCheatEvents.details,
        ipAddress: antiCheatEvents.ipAddress,
        userAgent: antiCheatEvents.userAgent,
        createdAt: antiCheatEvents.createdAt,
      })
      .from(antiCheatEvents)
      .innerJoin(users, eq(users.id, antiCheatEvents.userId))
      .where(whereClause)
      .orderBy(desc(antiCheatEvents.createdAt))
      .limit(limit)
      .offset(offset);

    const [totalRow] = await db
      .select({ count: sql<number>`count(*)` })
      .from(antiCheatEvents)
      .where(whereClause);

    // Detect heartbeat gaps: if filtering by userId, check for periods >120s
    // without a heartbeat during the contest window
    const heartbeatGaps: Array<{ userId: string; gapStartedAt: string; gapEndedAt: string; gapSeconds: number }> = [];
    if (userIdFilter && assignment.enableAntiCheat) {
      // Fetch the most recent heartbeat rows to prevent memory spikes for very
      // long contests. 5000 rows covers ~83 hours of heartbeats at 60-second
      // intervals. Using DESC order ensures we detect gaps near the *end* of the
      // contest (most relevant for instructors reviewing recent activity).
      const heartbeatsDesc = await db
        .select({ createdAt: antiCheatEvents.createdAt })
        .from(antiCheatEvents)
        .where(and(
          eq(antiCheatEvents.assignmentId, assignmentId),
          eq(antiCheatEvents.userId, userIdFilter),
          eq(antiCheatEvents.eventType, "heartbeat"),
        ))
        .orderBy(desc(antiCheatEvents.createdAt))
        .limit(5000);

      // Reverse to chronological order for gap detection
      const heartbeats = heartbeatsDesc.reverse();

      const GAP_THRESHOLD_MS = 120_000; // 2 minutes
      for (let i = 1; i < heartbeats.length; i++) {
        if (!heartbeats[i - 1].createdAt || !heartbeats[i].createdAt) continue;
        const prev = new Date(heartbeats[i - 1].createdAt).getTime();
        const curr = new Date(heartbeats[i].createdAt).getTime();
        const gap = curr - prev;
        if (gap > GAP_THRESHOLD_MS) {
          heartbeatGaps.push({
            userId: userIdFilter,
            gapStartedAt: new Date(prev).toISOString(),
            gapEndedAt: new Date(curr).toISOString(),
            gapSeconds: Math.round(gap / 1000),
          });
        }
      }
    }

    return apiSuccess({
      events,
      total: Number(totalRow?.count ?? 0),
      limit,
      offset,
      ...(heartbeatGaps.length > 0 ? { heartbeatGaps } : {}),
    });
  },
});
