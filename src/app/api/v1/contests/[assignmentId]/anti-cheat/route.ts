import { NextRequest } from "next/server";
import { nanoid } from "nanoid";
import { z } from "zod";
import { getApiUser, unauthorized, csrfForbidden, isAdmin, isInstructor } from "@/lib/api/auth";
import { apiSuccess, apiError } from "@/lib/api/responses";
import { db, sqlite } from "@/lib/db";
import { antiCheatEvents, users } from "@/lib/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { consumeApiRateLimit } from "@/lib/security/api-rate-limit";
import { getContestAssignment } from "@/lib/assignments/contests";
import { logger } from "@/lib/logger";

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
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ assignmentId: string }> }
) {
  try {
    const csrfError = csrfForbidden(request);
    if (csrfError) return csrfError;

    const rateLimitResponse = consumeApiRateLimit(request, "anti-cheat:log");
    if (rateLimitResponse) return rateLimitResponse;

    const user = await getApiUser(request);
    if (!user) return unauthorized();

    const { assignmentId } = await params;
    const assignment = getContestAssignment(assignmentId);

    if (!assignment || assignment.examMode === "none") {
      return apiError("notFound", 404);
    }

    // Verify user has access to this contest
    const hasAccess = sqlite
      .prepare(`SELECT 1 FROM enrollments WHERE group_id = ? AND user_id = ?
                UNION ALL
                SELECT 1 FROM contest_access_tokens WHERE assignment_id = ? AND user_id = ?
                LIMIT 1`)
      .get(assignment.groupId, user.id, assignmentId, user.id);
    if (!hasAccess) {
      return apiError("forbidden", 403);
    }

    if (!assignment.enableAntiCheat) {
      // Anti-cheat not enabled, silently accept
      return apiSuccess({ logged: false });
    }

    const body = await request.json();
    const parsed = antiCheatEventSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("invalidEventType", 400);
    }

    const { eventType, details: rawDetails } = parsed.data;
    const details = rawDetails ?? null;

    // Heartbeat events are tracked but don't need to store details
    if (eventType === "heartbeat") {
      db.insert(antiCheatEvents)
        .values({
          id: nanoid(),
          assignmentId,
          userId: user.id,
          eventType: "heartbeat",
          details: null,
          ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
          userAgent: null,
          createdAt: new Date(),
        })
        .run();
      return apiSuccess({ logged: true });
    }

    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    const userAgent = request.headers.get("user-agent") ?? null;

    db.insert(antiCheatEvents)
      .values({
        id: nanoid(),
        assignmentId,
        userId: user.id,
        eventType,
        details,
        ipAddress: ip,
        userAgent,
        createdAt: new Date(),
      })
      .run();

    return apiSuccess({ logged: true });
  } catch (error) {
    logger.error({ err: error }, "POST anti-cheat error");
    return apiError("serverError", 500);
  }
}

/** GET: Fetch anti-cheat events (instructor+, paginated) */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ assignmentId: string }> }
) {
  try {
    const user = await getApiUser(request);
    if (!user) return unauthorized();

    const { assignmentId } = await params;
    const assignment = getContestAssignment(assignmentId);

    if (!assignment || assignment.examMode === "none") {
      return apiError("notFound", 404);
    }

    const canView =
      isAdmin(user.role) ||
      (isInstructor(user.role) && assignment.instructorId === user.id);

    if (!canView) {
      return apiError("forbidden", 403);
    }

    const searchParams = request.nextUrl.searchParams;
    const userIdFilter = searchParams.get("userId");
    const eventTypeFilter = searchParams.get("eventType");
    const limit = Math.min(Number(searchParams.get("limit") ?? 100), 500);
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
  } catch (error) {
    logger.error({ err: error }, "GET anti-cheat error");
    return apiError("serverError", 500);
  }
}
