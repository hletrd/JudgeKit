import { NextRequest } from "next/server";
import { eq, and, inArray, sql } from "drizzle-orm";
import { createApiHandler } from "@/lib/api/handler";
import { apiSuccess, apiError } from "@/lib/api/responses";
import { execTransaction } from "@/lib/db";
import { recruitingInvitations } from "@/lib/db/schema";
import { bulkCreateRecruitingInvitations } from "@/lib/assignments/recruiting-invitations";
import { bulkCreateRecruitingInvitationsSchema } from "@/lib/validators/recruiting-invitations";
import { recordAuditEvent } from "@/lib/audit/events";

export const POST = createApiHandler({
  auth: { capabilities: ["recruiting.manage_invitations"] },
  schema: bulkCreateRecruitingInvitationsSchema,
  handler: async (req: NextRequest, { user, params, body }) => {
    const { assignmentId } = params;

    // Check for duplicate emails within the request
    const emails = body.invitations
      .map((inv) => inv.candidateEmail?.toLowerCase())
      .filter((e): e is string => !!e);
    const uniqueEmails = new Set(emails);
    if (uniqueEmails.size !== emails.length) {
      return apiError("duplicateEmailsInRequest", 400);
    }

    try {
      const created = await execTransaction(async (tx) => {
        const orderedEmails = [...uniqueEmails].sort();
        for (const email of orderedEmails) {
          await tx.execute(
            sql`SELECT pg_advisory_xact_lock(('x' || md5(${`${assignmentId}:${email}`}))::bit(64)::bigint)`
          );
        }

        if (orderedEmails.length > 0) {
          const existing = await tx
            .select({ email: recruitingInvitations.candidateEmail })
            .from(recruitingInvitations)
            .where(
              and(
                eq(recruitingInvitations.assignmentId, assignmentId),
                inArray(recruitingInvitations.candidateEmail, orderedEmails)
              )
            );
          if (existing.length > 0) {
            throw new Error("emailAlreadyInvited");
          }
        }

        return bulkCreateRecruitingInvitations({
          assignmentId,
          invitations: body.invitations.map((inv) => ({
            candidateName: inv.candidateName,
            candidateEmail: inv.candidateEmail,
            metadata: inv.metadata,
            expiresAt: inv.expiresAt ? new Date(inv.expiresAt) : null,
          })),
          createdBy: user.id,
        }, tx);
      });

      recordAuditEvent({
        actorId: user.id,
        actorRole: user.role,
        action: "recruiting_invitation.bulk_created",
        resourceType: "recruiting_invitation",
        resourceId: assignmentId,
        resourceLabel: `${created.length} invitations`,
        summary: `Bulk created ${created.length} recruiting invitations`,
        details: { assignmentId, count: created.length },
        request: req,
      });

      return apiSuccess(created, { status: 201 });
    } catch (error) {
      if (error instanceof Error && error.message === "emailAlreadyInvited") {
        return apiError("emailAlreadyInvited", 409);
      }
      throw error;
    }
  },
});
