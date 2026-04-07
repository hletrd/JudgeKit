import { NextRequest } from "next/server";
import { eq, and, inArray } from "drizzle-orm";
import { createApiHandler, isAdmin } from "@/lib/api/handler";
import { apiSuccess, apiError } from "@/lib/api/responses";
import { db } from "@/lib/db";
import { recruitingInvitations } from "@/lib/db/schema";
import { bulkCreateRecruitingInvitations } from "@/lib/assignments/recruiting-invitations";
import { bulkCreateRecruitingInvitationsSchema } from "@/lib/validators/recruiting-invitations";
import { recordAuditEvent } from "@/lib/audit/events";

export const POST = createApiHandler({
  schema: bulkCreateRecruitingInvitationsSchema,
  handler: async (req: NextRequest, { user, params, body }) => {
    if (!isAdmin(user.role)) return apiError("forbidden", 403);

    const { assignmentId } = params;

    // Check for duplicate emails within the request
    const emails = body.invitations
      .map((inv) => inv.candidateEmail?.toLowerCase())
      .filter((e): e is string => !!e);
    const uniqueEmails = new Set(emails);
    if (uniqueEmails.size !== emails.length) {
      return apiError("duplicateEmailsInRequest", 400);
    }

    // Check for duplicate emails against existing invitations
    if (uniqueEmails.size > 0) {
      const existing = await db
        .select({ email: recruitingInvitations.candidateEmail })
        .from(recruitingInvitations)
        .where(
          and(
            eq(recruitingInvitations.assignmentId, assignmentId),
            inArray(recruitingInvitations.candidateEmail, [...uniqueEmails])
          )
        );
      if (existing.length > 0) {
        return apiError("emailAlreadyInvited", 409);
      }
    }

    const created = await bulkCreateRecruitingInvitations({
      assignmentId,
      invitations: body.invitations.map((inv) => ({
        candidateName: inv.candidateName,
        candidateEmail: inv.candidateEmail,
        metadata: inv.metadata,
        expiresAt: inv.expiresAt ? new Date(inv.expiresAt) : null,
      })),
      createdBy: user.id,
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
  },
});
