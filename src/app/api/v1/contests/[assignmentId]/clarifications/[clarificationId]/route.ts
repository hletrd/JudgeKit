import { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { createApiHandler, forbidden } from "@/lib/api/handler";
import { apiError, apiSuccess } from "@/lib/api/responses";
import { db } from "@/lib/db";
import { contestClarifications } from "@/lib/db/schema";
import { canManageContest, getContestAssignment } from "@/lib/assignments/contests";
import { sanitizeMarkdown } from "@/lib/security/sanitize-html";
import { contestClarificationUpdateSchema } from "@/lib/validators/contest-clarifications";

async function requireManageAccess(assignmentId: string, userId: string, role: string) {
  const assignment = await getContestAssignment(assignmentId);

  if (!assignment || assignment.examMode === "none") {
    return { assignment: null, canManage: false };
  }

  const canManage = await canManageContest({ id: userId, role }, assignment);
  return { assignment, canManage };
}

export const PATCH = createApiHandler({
  rateLimit: "contests:clarifications:update",
  schema: contestClarificationUpdateSchema,
  handler: async (_req: NextRequest, { user, params, body }) => {
    const { assignmentId, clarificationId } = params;
    const access = await requireManageAccess(assignmentId, user.id, user.role);

    if (!access.assignment) {
      return apiError("notFound", 404);
    }

    if (!access.canManage) {
      return forbidden();
    }

    const existing = await db.query.contestClarifications.findFirst({
      where: and(
        eq(contestClarifications.id, clarificationId),
        eq(contestClarifications.assignmentId, assignmentId),
      ),
    });

    if (!existing) {
      return apiError("notFound", 404);
    }

    const [updated] = await db
      .update(contestClarifications)
      .set({
        answer: body.answer !== undefined ? sanitizeMarkdown(body.answer) : existing.answer,
        answerType: body.answerType ?? existing.answerType,
        isPublic: body.isPublic ?? existing.isPublic,
        answeredBy: body.answer !== undefined || body.answerType !== undefined ? user.id : existing.answeredBy,
        answeredAt: body.answer !== undefined || body.answerType !== undefined ? new Date() : existing.answeredAt,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(contestClarifications.id, clarificationId),
          eq(contestClarifications.assignmentId, assignmentId),
        ),
      )
      .returning();

    return apiSuccess(updated);
  },
});

export const DELETE = createApiHandler({
  rateLimit: "contests:clarifications:delete",
  handler: async (_req: NextRequest, { user, params }) => {
    const { assignmentId, clarificationId } = params;
    const access = await requireManageAccess(assignmentId, user.id, user.role);

    if (!access.assignment) {
      return apiError("notFound", 404);
    }

    if (!access.canManage) {
      return forbidden();
    }

    const [deleted] = await db
      .delete(contestClarifications)
      .where(
        and(
          eq(contestClarifications.id, clarificationId),
          eq(contestClarifications.assignmentId, assignmentId),
        ),
      )
      .returning();

    if (!deleted) {
      return apiError("notFound", 404);
    }

    return apiSuccess({ id: deleted.id });
  },
});
