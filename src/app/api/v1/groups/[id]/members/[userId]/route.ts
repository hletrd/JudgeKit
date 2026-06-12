import { NextRequest } from "next/server";
import { apiSuccess, apiError } from "@/lib/api/responses";
import { and, eq } from "drizzle-orm";
import { recordAuditEvent } from "@/lib/audit/events";
import { db, execTransaction } from "@/lib/db";
import { assignments, enrollments, submissions, users } from "@/lib/db/schema";
import { canManageGroupMembersAsync } from "@/lib/assignments/management";
import { revokeContestAccessTokensForGroup } from "@/lib/assignments/contest-access-tokens";
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

    const canManage = await canManageGroupMembersAsync(
      group.instructorId,
      user.id,
      user.role,
      id
    );

    if (!canManage) return forbidden();

    try {
      const txResult = await execTransaction(async (tx) => {
        const [enrollment] = await tx
          .select({
            id: enrollments.id,
          })
          .from(enrollments)
          .where(and(eq(enrollments.groupId, id), eq(enrollments.userId, userId)))
          .limit(1)
          .for("update");

        if (!enrollment) {
          return { error: "studentEnrollmentNotFound" as const };
        }

        const assignmentSubmission = await tx
          .select({ id: submissions.id })
          .from(submissions)
          .innerJoin(assignments, eq(assignments.id, submissions.assignmentId))
          .where(and(eq(submissions.userId, userId), eq(assignments.groupId, id)))
          .then((rows) => rows[0] ?? null);

        if (assignmentSubmission) {
          throw new Error("groupMemberRemovalBlocked");
        }

        const [member] = await tx
          .select({ id: users.id, username: users.username })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1);

        await tx.delete(enrollments).where(eq(enrollments.id, enrollment.id));

        // Roster removal must REVOKE contest access, not just enrollment
        // (RPF cycle-6 AGG6-1/SEC6-1): invite-era contest_access_tokens
        // otherwise survive and silently re-grant submit + contest detail
        // for this group's assignments.
        const revokedTokens = await revokeContestAccessTokensForGroup(tx, id, userId);

        return { member, revokedTokens };
      });

      if ("error" in txResult) {
        return apiError("studentEnrollmentNotFound", 404);
      }

      const { member, revokedTokens } = txResult;

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
          revokedAccessTokens: revokedTokens,
        },
        request: req,
      });
    } catch (err) {
      if (err instanceof Error && err.message === "groupMemberRemovalBlocked") {
        return apiError("groupMemberRemovalBlocked", 409);
      }
      throw err;
    }

    return apiSuccess({ userId });
  },
});
