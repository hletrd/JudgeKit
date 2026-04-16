import { NextRequest } from "next/server";
import { desc, eq } from "drizzle-orm";
import { createApiHandler, forbidden } from "@/lib/api/handler";
import { apiError, apiSuccess } from "@/lib/api/responses";
import { db } from "@/lib/db";
import { contestClarifications } from "@/lib/db/schema";
import { canManageContest, getContestAssignment } from "@/lib/assignments/contests";
import { rawQueryOne } from "@/lib/db/queries";
import { sanitizeMarkdown } from "@/lib/security/sanitize-html";
import { contestClarificationCreateSchema } from "@/lib/validators/contest-clarifications";

async function getContestClarificationAccess(assignmentId: string, userId: string, role: string) {
  const assignment = await getContestAssignment(assignmentId);

  if (!assignment || assignment.examMode === "none") {
    return { assignment: null, canManage: false, hasAccess: false };
  }

  const canManage = await canManageContest({ id: userId, role }, assignment);
  if (canManage) {
    return { assignment, canManage: true, hasAccess: true };
  }

  const hasAccess = await rawQueryOne(
    `SELECT 1 FROM enrollments WHERE group_id = @groupId AND user_id = @userId
     UNION ALL
     SELECT 1 FROM contest_access_tokens WHERE assignment_id = @assignmentId AND user_id = @userId
     LIMIT 1`,
    { groupId: assignment.groupId, userId, assignmentId }
  );

  return { assignment, canManage: false, hasAccess: Boolean(hasAccess) };
}

export const GET = createApiHandler({
  rateLimit: "contests:clarifications",
  handler: async (_req: NextRequest, { user, params }) => {
    const { assignmentId } = params;
    const access = await getContestClarificationAccess(assignmentId, user.id, user.role);

    if (!access.assignment) {
      return apiError("notFound", 404);
    }

    if (!access.hasAccess) {
      return forbidden();
    }

    const rows = await db.query.contestClarifications.findMany({
      where: eq(contestClarifications.assignmentId, assignmentId),
      orderBy: [desc(contestClarifications.answeredAt), desc(contestClarifications.createdAt)],
    });

    const visibleRows = access.canManage
      ? rows
      : rows.filter((row) => row.userId === user.id || (row.isPublic && row.answer));

    return apiSuccess(visibleRows);
  },
});

export const POST = createApiHandler({
  rateLimit: "contests:clarifications:create",
  schema: contestClarificationCreateSchema,
  handler: async (_req: NextRequest, { user, params, body }) => {
    const { assignmentId } = params;
    const access = await getContestClarificationAccess(assignmentId, user.id, user.role);

    if (!access.assignment) {
      return apiError("notFound", 404);
    }

    if (!access.hasAccess) {
      return forbidden();
    }

    const problemId = body.problemId?.trim() ? body.problemId.trim() : null;
    if (problemId) {
      const assignmentProblem = await rawQueryOne(
        `SELECT 1 FROM assignment_problems WHERE assignment_id = @assignmentId AND problem_id = @problemId LIMIT 1`,
        { assignmentId, problemId }
      );
      if (!assignmentProblem) {
        return apiError("problemNotFound", 404);
      }
    }

    const [created] = await db
      .insert(contestClarifications)
      .values({
        assignmentId,
        problemId,
        userId: user.id,
        question: sanitizeMarkdown(body.question),
      })
      .returning();

    return apiSuccess(created, { status: 201 });
  },
});
