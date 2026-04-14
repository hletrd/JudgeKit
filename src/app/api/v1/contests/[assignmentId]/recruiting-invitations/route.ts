import { NextRequest } from "next/server";
import { createApiHandler } from "@/lib/api/handler";
import { apiSuccess, apiError } from "@/lib/api/responses";
import { eq, and, sql } from "drizzle-orm";
import { execTransaction } from "@/lib/db";
import { recruitingInvitations } from "@/lib/db/schema";
import {
  createRecruitingInvitation,
  getRecruitingInvitations,
} from "@/lib/assignments/recruiting-invitations";
import { canManageContest, getContestAssignment } from "@/lib/assignments/contests";
import { createRecruitingInvitationSchema } from "@/lib/validators/recruiting-invitations";
import { recordAuditEvent } from "@/lib/audit/events";

export const GET = createApiHandler({
  auth: { capabilities: ["recruiting.manage_invitations"] },
  handler: async (req: NextRequest, { user, params }) => {
    const { assignmentId } = params;
    const assignment = await getContestAssignment(assignmentId);
    if (!assignment) return apiError("notFound", 404, "Assignment");
    if (!(await canManageContest(user, assignment))) return apiError("forbidden", 403);

    const url = new URL(req.url);
    const status = url.searchParams.get("status") ?? undefined;
    const search = url.searchParams.get("search") ?? undefined;

    const invitations = await getRecruitingInvitations(assignmentId, { status, search });
    return apiSuccess(invitations);
  },
});

export const POST = createApiHandler({
  auth: { capabilities: ["recruiting.manage_invitations"] },
  rateLimit: "api-keys:create",
  schema: createRecruitingInvitationSchema,
  handler: async (req: NextRequest, { user, params, body }) => {
    const { assignmentId } = params;
    const assignment = await getContestAssignment(assignmentId);
    if (!assignment) return apiError("notFound", 404, "Assignment");
    if (!(await canManageContest(user, assignment))) return apiError("forbidden", 403);

    try {
      const invitation = await execTransaction(async (tx) => {
        const normalizedEmail = body.candidateEmail?.trim().toLowerCase() ?? null;
        if (normalizedEmail) {
          await tx.execute(
            sql`SELECT pg_advisory_xact_lock(('x' || md5(${`${assignmentId}:${normalizedEmail}`}))::bit(64)::bigint)`
          );
          const existing = await tx
            .select({ id: recruitingInvitations.id })
            .from(recruitingInvitations)
            .where(
              and(
                eq(recruitingInvitations.assignmentId, assignmentId),
                sql`lower(${recruitingInvitations.candidateEmail}) = ${normalizedEmail}`,
              )
            )
            .limit(1);
          if (existing.length > 0) {
            throw new Error("emailAlreadyInvited");
          }
        }

        return createRecruitingInvitation({
          assignmentId,
          candidateName: body.candidateName,
          candidateEmail: body.candidateEmail,
          metadata: body.metadata,
          expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
          createdBy: user.id,
        }, tx);
      });

      recordAuditEvent({
        actorId: user.id,
        actorRole: user.role,
        action: "recruiting_invitation.created",
        resourceType: "recruiting_invitation",
        resourceId: invitation.id,
        resourceLabel: body.candidateName,
        summary: `Created recruiting invitation for "${body.candidateName}"`,
        details: { assignmentId, candidateEmail: body.candidateEmail ?? null },
        request: req,
      });

      return apiSuccess(invitation, { status: 201 });
    } catch (error) {
      if (error instanceof Error && error.message === "emailAlreadyInvited") {
        return apiError("emailAlreadyInvited", 409);
      }
      throw error;
    }
  },
});
