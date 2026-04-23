import { NextRequest } from "next/server";
import { eq, and, inArray, sql } from "drizzle-orm";
import { createApiHandler } from "@/lib/api/handler";
import { apiSuccess, apiError } from "@/lib/api/responses";
import { execTransaction } from "@/lib/db";
import { recruitingInvitations } from "@/lib/db/schema";
import { bulkCreateRecruitingInvitations } from "@/lib/assignments/recruiting-invitations";
import { bulkCreateRecruitingInvitationsSchema } from "@/lib/validators/recruiting-invitations";
import { recordAuditEvent } from "@/lib/audit/events";
import { getDbNowUncached } from "@/lib/db-time";
import { MAX_EXPIRY_MS } from "@/lib/assignments/recruiting-constants";

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
      // Fetch DB time once for all invitations in the batch.
      const dbNow = await getDbNowUncached();

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
          invitations: body.invitations.map((inv) => {
            // Compute expiresAt server-side using DB time
            let expiresAt: Date | null = null;
            if (inv.expiryDays) {
              expiresAt = new Date(dbNow.getTime() + inv.expiryDays * 86400000);
            } else if (inv.expiryDate) {
              expiresAt = new Date(`${inv.expiryDate}T23:59:59Z`);
              // Defense-in-depth: reject Invalid Date construction even though the
              // Zod schema enforces YYYY-MM-DD format.
              if (!Number.isFinite(expiresAt.getTime())) {
                throw new Error("invalidExpiryDate");
              }
              // Validate the date is in the future (relative to DB time)
              if (expiresAt <= dbNow) {
                throw new Error("expiryDateInPast");
              }
              // Reject unreasonably far-future expiry (consistent with expiryDays max 3650)
              if ((expiresAt.getTime() - dbNow.getTime()) > MAX_EXPIRY_MS) {
                throw new Error("expiryDateTooFar");
              }
            }
            return {
              candidateName: inv.candidateName,
              candidateEmail: inv.candidateEmail,
              metadata: inv.metadata,
              expiresAt,
            };
          }),
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
      if (error instanceof Error && error.message === "expiryDateInPast") {
        return apiError("expiryDateInPast", 400);
      }
      if (error instanceof Error && error.message === "invalidExpiryDate") {
        return apiError("invalidExpiryDate", 400);
      }
      if (error instanceof Error && error.message === "expiryDateTooFar") {
        return apiError("expiryDateTooFar", 400);
      }
      throw error;
    }
  },
});
