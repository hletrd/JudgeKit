import { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { createApiHandler, forbidden } from "@/lib/api/handler";
import { apiError, apiSuccess } from "@/lib/api/responses";
import { db } from "@/lib/db";
import { contestAnnouncements } from "@/lib/db/schema";
import { canManageContest, getContestAssignment } from "@/lib/assignments/contests";
import { sanitizeMarkdown } from "@/lib/security/sanitize-html";
import { contestAnnouncementUpdateSchema } from "@/lib/validators/contest-announcements";

async function requireManageAccess(assignmentId: string, userId: string, role: string) {
  const assignment = await getContestAssignment(assignmentId);

  if (!assignment || assignment.examMode === "none") {
    return { assignment: null, canManage: false };
  }

  const canManage = await canManageContest({ id: userId, role }, assignment);
  return { assignment, canManage };
}

export const PATCH = createApiHandler({
  rateLimit: "contests:announcements:update",
  schema: contestAnnouncementUpdateSchema,
  handler: async (_req: NextRequest, { user, params, body }) => {
    const { assignmentId, announcementId } = params;
    const access = await requireManageAccess(assignmentId, user.id, user.role);

    if (!access.assignment) {
      return apiError("notFound", 404);
    }

    if (!access.canManage) {
      return forbidden();
    }

    const existing = await db.query.contestAnnouncements.findFirst({
      where: and(
        eq(contestAnnouncements.id, announcementId),
        eq(contestAnnouncements.assignmentId, assignmentId),
      ),
    });

    if (!existing) {
      return apiError("notFound", 404);
    }

    const [updated] = await db
      .update(contestAnnouncements)
      .set({
        title: body.title?.trim() ?? existing.title,
        content: body.content !== undefined ? sanitizeMarkdown(body.content) : existing.content,
        isPinned: body.isPinned ?? existing.isPinned,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(contestAnnouncements.id, announcementId),
          eq(contestAnnouncements.assignmentId, assignmentId),
        ),
      )
      .returning();

    return apiSuccess(updated);
  },
});

export const DELETE = createApiHandler({
  rateLimit: "contests:announcements:delete",
  handler: async (_req: NextRequest, { user, params }) => {
    const { assignmentId, announcementId } = params;
    const access = await requireManageAccess(assignmentId, user.id, user.role);

    if (!access.assignment) {
      return apiError("notFound", 404);
    }

    if (!access.canManage) {
      return forbidden();
    }

    const [deleted] = await db
      .delete(contestAnnouncements)
      .where(
        and(
          eq(contestAnnouncements.id, announcementId),
          eq(contestAnnouncements.assignmentId, assignmentId),
        ),
      )
      .returning();

    if (!deleted) {
      return apiError("notFound", 404);
    }

    return apiSuccess({ id: deleted.id });
  },
});
