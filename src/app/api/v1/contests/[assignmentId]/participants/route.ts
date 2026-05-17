import { NextRequest } from "next/server";
import { createApiHandler } from "@/lib/api/handler";
import { apiSuccess, apiError } from "@/lib/api/responses";
import { getContestAssignment, canManageContest } from "@/lib/assignments/contests";
import { db } from "@/lib/db";
import { users, enrollments, contestAccessTokens } from "@/lib/db/schema";
import { and, desc, eq } from "drizzle-orm";

const PARTICIPANT_LIST_LIMIT = 500;

/**
 * GET - List enrolled participants for a contest.
 *
 * Returns everyone in the contest's owning group, with `accessVia` indicating
 * how they got in (explicit invitation / access code = "token", or existing
 * group roster = "group"). Used by the contest management UI to show who has
 * been invited so far.
 */
export const GET = createApiHandler({
  rateLimit: "contest:invite-search",
  handler: async (_req: NextRequest, { user, params }) => {
    const { assignmentId } = params;

    const assignment = await getContestAssignment(assignmentId);
    if (!assignment || assignment.examMode === "none") return apiError("notFound", 404);
    if (!(await canManageContest(user, assignment))) return apiError("forbidden", 403);

    const rows = await db
      .select({
        id: users.id,
        username: users.username,
        name: users.name,
        className: users.className,
        enrolledAt: enrollments.enrolledAt,
        tokenRedeemedAt: contestAccessTokens.redeemedAt,
      })
      .from(enrollments)
      .innerJoin(users, eq(users.id, enrollments.userId))
      .leftJoin(
        contestAccessTokens,
        and(
          eq(contestAccessTokens.userId, enrollments.userId),
          eq(contestAccessTokens.assignmentId, assignmentId)
        )
      )
      .where(and(eq(enrollments.groupId, assignment.groupId), eq(users.isActive, true)))
      .orderBy(desc(enrollments.enrolledAt))
      .limit(PARTICIPANT_LIST_LIMIT);

    const participants = rows.map((row) => ({
      id: row.id,
      username: row.username,
      name: row.name,
      className: row.className,
      enrolledAt: row.enrolledAt.toISOString(),
      accessVia: row.tokenRedeemedAt ? "token" : "group",
    }));

    return apiSuccess({
      participants,
      totalCount: participants.length,
      limit: PARTICIPANT_LIST_LIMIT,
    });
  },
});
