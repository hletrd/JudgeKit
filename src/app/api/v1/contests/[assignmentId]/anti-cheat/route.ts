import { NextRequest } from "next/server";
import { nanoid } from "nanoid";
import { z } from "zod";
import { createApiHandler, isAdmin, isInstructor } from "@/lib/api/handler";
import { apiSuccess, apiError } from "@/lib/api/responses";
import { db } from "@/lib/db";
import { rawQueryOne } from "@/lib/db/queries";
import { antiCheatEvents, users } from "@/lib/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { getContestAssignment } from "@/lib/assignments/contests";
import { LRUCache } from "lru-cache";

/** last heartbeat insert time per "assignmentId:userId" — only insert once per 60s */
const lastHeartbeatTime = new LRUCache<string, number>({ max: 10_000, ttl: 120_000 });

const VALID_EVENT_TYPES = [
  "tab_switch",
  "copy",
  "paste",
  "blur",
  "contextmenu",
  "ip_change",
  "code_similarity",
  "heartbeat",
] as const;

const antiCheatEventSchema = z.object({
  eventType: z.enum(VALID_EVENT_TYPES),
  details: z.string().max(500).optional(),
});

/** POST: Log an anti-cheat event (student-facing, rate-limited) */
export const POST = createApiHandler({
  rateLimit: "anti-cheat:log",
  schema: antiCheatEventSchema,
  handler: async (req: NextRequest, { user, body, params }) => {
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
    const details = rawDetails ? JSON.stringify({ message: rawDetails }) : null;

    // Heartbeat events: only insert a DB row once per 60 seconds to reduce churn
    if (eventType === "heartbeat") {
      const heartbeatKey = `${assignmentId}:${user.id}`;
      const nowMs = Date.now();
      const last = lastHeartbeatTime.get(heartbeatKey) ?? 0;
      if (nowMs - last >= 60_000) {
        lastHeartbeatTime.set(heartbeatKey, nowMs);
        await db.insert(antiCheatEvents)
          .values({
            id: nanoid(),
            assignmentId,
            userId: user.id,
            eventType: "heartbeat",
            details: null,
            ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
            userAgent: null,
            createdAt: new Date(),
          });
      }
      return apiSuccess({ logged: true });
    }

    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
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

    const canView =
      isAdmin(user.role) ||
      (isInstructor(user.role) && assignment.instructorId === user.id);

    if (!canView) {
      return apiError("forbidden", 403);
    }

    const searchParams = req.nextUrl.searchParams;
    const userIdFilter = searchParams.get("userId");
    const eventTypeFilter = searchParams.get("eventType");
    const limit = Math.max(1, Math.min(Number(searchParams.get("limit") ?? 100), 500));
    const offset = Number(searchParams.get("offset") ?? 0);

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

    return apiSuccess({
      events,
      total: Number(totalRow?.count ?? 0),
      limit,
      offset,
    });
  },
});
