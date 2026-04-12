import { NextRequest } from "next/server";
import { createApiHandler } from "@/lib/api/handler";
import { apiSuccess, apiError } from "@/lib/api/responses";
import {
  getRecruitingInvitation,
  updateRecruitingInvitation,
  deleteRecruitingInvitation,
  resetRecruitingInvitationResumeCode,
} from "@/lib/assignments/recruiting-invitations";
import { updateRecruitingInvitationSchema } from "@/lib/validators/recruiting-invitations";
import { recordAuditEvent } from "@/lib/audit/events";

export const GET = createApiHandler({
  auth: { capabilities: ["recruiting.manage_invitations"] },
  handler: async (_req: NextRequest, { params }) => {
    const invitation = await getRecruitingInvitation(params.invitationId);
    if (!invitation) return apiError("notFound", 404, "RecruitingInvitation");

    return apiSuccess(invitation);
  },
});

export const PATCH = createApiHandler({
  auth: { capabilities: ["recruiting.manage_invitations"] },
  schema: updateRecruitingInvitationSchema,
  handler: async (req: NextRequest, { user, params, body }) => {
    const invitation = await getRecruitingInvitation(params.invitationId);
    if (!invitation) return apiError("notFound", 404, "RecruitingInvitation");

    if (body.resetResumeCode) {
      if (invitation.status !== "redeemed") {
        return apiError("resumeCodeResetRequiresRedeemed", 400);
      }

      const resumeCode = await resetRecruitingInvitationResumeCode(params.invitationId);

      recordAuditEvent({
        actorId: user.id,
        actorRole: user.role,
        action: "recruiting_invitation.resume_code_reset",
        resourceType: "recruiting_invitation",
        resourceId: params.invitationId,
        resourceLabel: invitation.candidateName,
        summary: `Reset resume code for "${invitation.candidateName}"`,
        request: req,
      });

      return apiSuccess({ id: params.invitationId, resumeCode });
    }

    // Validate status state machine transitions
    if (body.status !== undefined && body.status !== invitation.status) {
      const current = invitation.status;
      const next = body.status;

      if (current === "redeemed") {
        return apiError("invalidStatusTransition", 400, "Redeemed invitations are immutable");
      }

      const allowed: Record<string, string[]> = {
        pending: ["revoked", "redeemed"],
        revoked: ["pending"],
      };

      const permitted = allowed[current];
      if (!permitted || !permitted.includes(next)) {
        return apiError("invalidStatusTransition", 400, `Cannot transition from ${current} to ${next}`);
      }
    }

    await updateRecruitingInvitation(params.invitationId, {
      expiresAt: body.expiresAt !== undefined
        ? (body.expiresAt ? new Date(body.expiresAt) : null)
        : undefined,
      metadata: body.metadata,
      status: body.status,
    });

    recordAuditEvent({
      actorId: user.id,
      actorRole: user.role,
      action: body.status === "revoked"
        ? "recruiting_invitation.revoked"
        : "recruiting_invitation.updated",
      resourceType: "recruiting_invitation",
      resourceId: params.invitationId,
      resourceLabel: invitation.candidateName,
      summary: body.status === "revoked"
        ? `Revoked recruiting invitation for "${invitation.candidateName}"`
        : `Updated recruiting invitation for "${invitation.candidateName}"`,
      details: body,
      request: req,
    });

    return apiSuccess({ id: params.invitationId });
  },
});

export const DELETE = createApiHandler({
  auth: { capabilities: ["recruiting.manage_invitations"] },
  handler: async (req: NextRequest, { user, params }) => {
    const invitation = await getRecruitingInvitation(params.invitationId);
    if (!invitation) return apiError("notFound", 404, "RecruitingInvitation");

    if (invitation.status !== "pending") {
      return apiError("cannotDeleteNonPending", 400);
    }

    await deleteRecruitingInvitation(params.invitationId);

    recordAuditEvent({
      actorId: user.id,
      actorRole: user.role,
      action: "recruiting_invitation.deleted",
      resourceType: "recruiting_invitation",
      resourceId: params.invitationId,
      resourceLabel: invitation.candidateName,
      summary: `Deleted recruiting invitation for "${invitation.candidateName}"`,
      request: req,
    });

    return apiSuccess({ id: params.invitationId });
  },
});
