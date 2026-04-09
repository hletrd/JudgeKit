import { NextRequest } from "next/server";
import { apiSuccess, apiError } from "@/lib/api/responses";
import { and, eq } from "drizzle-orm";
import { recordAuditEvent } from "@/lib/audit/events";
import { db, execTransaction } from "@/lib/db";
import { assignments, enrollments, submissions } from "@/lib/db/schema";
import { canManageGroupResourcesAsync } from "@/lib/assignments/management";
import { forbidden, notFound, createApiHandler } from "@/lib/api/handler";

export const DELETE = createApiHandler({
  rateLimit: "members:remove",
  handler: async (req: NextRequest, { user, params }) => {
    const { id, userId } = params;
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

    const enrollment = await db.query.enrollments.findFirst({
      where: and(eq(enrollments.groupId, id), eq(enrollments.userId, userId)),
      columns: { id: true },
    });

    if (!enrollment) {
      return apiError("studentEnrollmentNotFound", 404);
    }

    const member = await db.query.users.findFirst({
      where: (users, { eq: equals }) => equals(users.id, userId),
      columns: { id: true, username: true },
    });

    try {
      await execTransaction(async (tx) => {
        const assignmentSubmission = await tx
          .select({ id: submissions.id })
          .from(submissions)
          .innerJoin(assignments, eq(assignments.id, submissions.assignmentId))
          .where(and(eq(submissions.userId, userId), eq(assignments.groupId, id)))
          .then((rows) => rows[0] ?? null);

        if (assignmentSubmission) {
          throw new Error("groupMemberRemovalBlocked");
        }

        await tx.delete(enrollments).where(eq(enrollments.id, enrollment.id));
      });
    } catch (err) {
      if (err instanceof Error && err.message === "groupMemberRemovalBlocked") {
        return apiError("groupMemberRemovalBlocked", 409);
      }
      throw err;
    }

    recordAuditEvent({
      actorId: user.id,
      actorRole: user.role,
      action: "group.member_removed",
      resourceType: "group_member",
      resourceId: userId,
      resourceLabel: member?.username ?? userId,
      summary: `Removed @${member?.username ?? userId} from group membership`,
      details: {
        groupId: id,
        username: member?.username ?? null,
      },
      request: req,
    });

    return apiSuccess({ userId });
  },
});
