import { NextRequest } from "next/server";
import { apiSuccess } from "@/lib/api/responses";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { assignments } from "@/lib/db/schema";
import { getExamSessionsForAssignment } from "@/lib/assignments/exam-sessions";
import { canManageGroupResourcesAsync } from "@/lib/assignments/management";
import { createApiHandler, forbidden, notFound } from "@/lib/api/handler";

export const GET = createApiHandler({
  handler: async (_req: NextRequest, { user, params }) => {
    const { id, assignmentId } = params;

    const group = await db.query.groups.findFirst({
      where: (groups, { eq: equals }) => equals(groups.id, id),
      columns: { id: true, instructorId: true },
    });
    if (!group) return notFound("Group");

    const canManage = await canManageGroupResourcesAsync(
      group.instructorId,
      user.id,
      user.role,
      id
    );
    if (!canManage) return forbidden();

    const assignment = await db.query.assignments.findFirst({
      where: eq(assignments.id, assignmentId),
      columns: { id: true, groupId: true },
    });
    if (!assignment || assignment.groupId !== id) return notFound("Assignment");

    const sessions = await getExamSessionsForAssignment(assignmentId);
    return apiSuccess(sessions.map(s => ({
      ...s,
      startedAt: s.startedAt.toISOString(),
      personalDeadline: s.personalDeadline.toISOString(),
    })));
  },
});
