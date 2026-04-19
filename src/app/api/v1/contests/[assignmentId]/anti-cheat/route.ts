import { NextRequest } from "next/server";
import { extractClientIp } from "@/lib/security/ip";
import { nanoid } from "nanoid";
import { z } from "zod";
import { createApiHandler } from "@/lib/api/handler";
import { apiSuccess, apiError } from "@/lib/api/responses";
import { db } from "@/lib/db";
import { rawQueryOne } from "@/lib/db/queries";
import { antiCheatEvents, users } from "@/lib/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { parsePositiveInt, parseNonNegativeInt } from "@/lib/validators/query-params";
import { getContestAssignment, canManageContest } from "@/lib/assignments/contests";
import { LRUCache } from "lru-cache";
import { getUnsupportedRealtimeGuard, shouldRecordSharedHeartbeat, usesSharedRealtimeCoordination } from "@/lib/realtime/realtime-coordination";

/** last heartbeat insert time per "assignmentId:userId" — only insert once per 60s */
const lastHeartbeatTime = new LRUCache<string, number>({ max: 10_000, ttl: 120_000 });

export const CLIENT_EVENT_TYPES = [
  "tab_switch",
  "copy",
  "paste",
  "blur",
  "contextmenu",
  "heartbeat",
] as const;

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

    // Verify user has access to this contest
    const hasAccess = await rawQueryOne(
      `SELECT 1 FROM enrollments WHERE group_id = @groupId AND user_id = @userId
       UNION ALL
       SELECT 1 FROM contest_access_tokens WHERE assignment_id = @assignmentId AND user_id = @userId
       LIMIT 1`,
      { groupId: assignment.groupId, userId: user.id, assignmentId }
    );
    if (!hasAccess) {
      return apiError("forbidden", 403);
    }

    const now = new Date();
    if (assignment.startsAt && now < assignment.startsAt) {
      return apiError("contestNotStarted", 403);
    }
    if (assignment.deadline && now > assignment.deadline) {
      return apiError("contestEnded", 403);
    }

    if (!assignment.enableAntiCheat) {
      // Anti-cheat not enabled, silently accept
      return apiSuccess({ logged: false });
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
        const nowMs = Date.now();
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
            createdAt: new Date(),
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
        createdAt: new Date(),
      });

    return apiSuccess({ logged: true });
  },
});

/** GET: Fetch anti-cheat events (instructor+, paginated) */
export const GET = createApiHandler({
  handler: async (req: NextRequest, { user, params }) => {
    const { assignmentId } = params;
    const assignment = await getContestAssignment(assignmentId);

    if (!assignment || assignment.examMode === "none") {
      return apiError("notFound", 404);
    }

    const canView = await canManageContest(user, assignment);

    if (!canView) {
      return apiError("forbidden", 403);
    }

    const searchParams = req.nextUrl.searchParams;
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
        const prev = new Date(heartbeats[i - 1].createdAt!).getTime();
        const curr = new Date(heartbeats[i].createdAt!).getTime();
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
