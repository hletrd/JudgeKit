import { NextRequest } from "next/server";
import { createApiHandler } from "@/lib/api/handler";
import { apiSuccess, apiError } from "@/lib/api/responses";
import {
  getRecruitingInvitation,
  updateRecruitingInvitation,
  deleteRecruitingInvitation,
  resetRecruitingInvitationAccountPassword,
} from "@/lib/assignments/recruiting-invitations";
import { canManageContest, getContestAssignment } from "@/lib/assignments/contests";
import { updateRecruitingInvitationSchema } from "@/lib/validators/recruiting-invitations";
import { recordAuditEvent } from "@/lib/audit/events";
import { getDbNowUncached } from "@/lib/db-time";

type AuthorizedInvitationResult =
  | {
      error: ReturnType<typeof apiError>;
      invitation: null;
    }
  | {
      error: null;
      invitation: NonNullable<Awaited<ReturnType<typeof getRecruitingInvitation>>>;
    };

async function getAuthorizedInvitation(
  assignmentId: string,
  invitationId: string,
  user: { id: string; role: string }
): Promise<AuthorizedInvitationResult> {
  const assignment = await getContestAssignment(assignmentId);
  if (!assignment) {
    return { error: apiError("notFound", 404, "Assignment"), invitation: null };
  }
  if (!(await canManageContest(user, assignment))) {
    return { error: apiError("forbidden", 403), invitation: null };
  }

  const invitation = await getRecruitingInvitation(invitationId);
  if (!invitation || invitation.assignmentId !== assignmentId) {
    return { error: apiError("notFound", 404, "RecruitingInvitation"), invitation: null };
  }

  return { error: null, invitation };
}

export const GET = createApiHandler({
  auth: { capabilities: ["recruiting.manage_invitations"] },
  handler: async (_req: NextRequest, { user, params }) => {
    const result = await getAuthorizedInvitation(params.assignmentId, params.invitationId, user);
    if (result.error) return result.error;

    return apiSuccess(result.invitation);
  },
});

export const PATCH = createApiHandler({
  auth: { capabilities: ["recruiting.manage_invitations"] },
  schema: updateRecruitingInvitationSchema,
  handler: async (req: NextRequest, { user, params, body }) => {
    const result = await getAuthorizedInvitation(params.assignmentId, params.invitationId, user);
    if (result.error) return result.error;
    const invitation = result.invitation;

    if (body.resetAccountPassword) {
      if (invitation.status !== "redeemed") {
        return apiError("accountPasswordResetRequiresRedeemed", 400);
      }

      await resetRecruitingInvitationAccountPassword(params.invitationId);

      recordAuditEvent({
        actorId: user.id,
        actorRole: user.role,
        action: "recruiting_invitation.account_password_reset",
        resourceType: "recruiting_invitation",
        resourceId: params.invitationId,
        resourceLabel: invitation.candidateName,
        summary: `Reset recruiting account password for "${invitation.candidateName}"`,
        request: req,
      });

      return apiSuccess({ id: params.invitationId, passwordResetRequired: true });
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

    // Compute expiresAt server-side from expiryDays or expiryDate using DB time
    let expiresAtUpdate: Date | null | undefined = undefined;
    if (body.expiryDays !== undefined || body.expiryDate !== undefined) {
      const dbNow = await getDbNowUncached();
      const MAX_EXPIRY_MS = 10 * 365.25 * 24 * 60 * 60 * 1000; // ~10 years
      if (body.expiryDays) {
        expiresAtUpdate = new Date(dbNow.getTime() + body.expiryDays * 86400000);
      } else if (body.expiryDate) {
        expiresAtUpdate = new Date(`${body.expiryDate}T23:59:59Z`);
        if (expiresAtUpdate <= dbNow) {
          return apiError("expiryDateInPast", 400);
        }
        // Reject unreasonably far-future expiry (consistent with expiryDays max 3650)
        if ((expiresAtUpdate.getTime() - dbNow.getTime()) > MAX_EXPIRY_MS) {
          return apiError("expiryDateTooFar", 400);
        }
      } else {
        // expiryDays: null or expiryDate: null means remove the expiry
        expiresAtUpdate = null;
      }
    }

    await updateRecruitingInvitation(params.invitationId, {
      expiresAt: expiresAtUpdate,
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
    const result = await getAuthorizedInvitation(params.assignmentId, params.invitationId, user);
    if (result.error) return result.error;
    const invitation = result.invitation;

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
