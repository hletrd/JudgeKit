import { NextRequest } from "next/server";
import { desc, eq } from "drizzle-orm";
import { createApiHandler, forbidden } from "@/lib/api/handler";
import { apiError, apiSuccess } from "@/lib/api/responses";
import { db } from "@/lib/db";
import { contestAnnouncements } from "@/lib/db/schema";
import { canManageContest, getContestAssignment } from "@/lib/assignments/contests";
import { rawQueryOne } from "@/lib/db/queries";
import { sanitizeMarkdown } from "@/lib/security/sanitize-html";
import { contestAnnouncementCreateSchema } from "@/lib/validators/contest-announcements";

async function canAccessContestAnnouncements(assignmentId: string, userId: string, role: string) {
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
  rateLimit: "contests:announcements",
  handler: async (_req: NextRequest, { user, params }) => {
    const { assignmentId } = params;
    const access = await canAccessContestAnnouncements(assignmentId, user.id, user.role);

    if (!access.assignment) {
      return apiError("notFound", 404);
    }

    if (!access.hasAccess) {
      return forbidden();
    }

    const rows = await db.query.contestAnnouncements.findMany({
      where: eq(contestAnnouncements.assignmentId, assignmentId),
      orderBy: [desc(contestAnnouncements.isPinned), desc(contestAnnouncements.createdAt)],
    });

    return apiSuccess(rows);
  },
});

export const POST = createApiHandler({
  rateLimit: "contests:announcements:create",
  schema: contestAnnouncementCreateSchema,
  handler: async (_req: NextRequest, { user, params, body }) => {
    const { assignmentId } = params;
    const access = await canAccessContestAnnouncements(assignmentId, user.id, user.role);

    if (!access.assignment) {
      return apiError("notFound", 404);
    }

    if (!access.canManage) {
      return forbidden();
    }

    const [created] = await db
      .insert(contestAnnouncements)
      .values({
        assignmentId,
        title: body.title.trim(),
        content: sanitizeMarkdown(body.content),
        isPinned: body.isPinned ?? false,
        createdBy: user.id,
      })
      .returning();

    return apiSuccess(created, { status: 201 });
  },
});
