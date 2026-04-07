import { NextRequest } from "next/server";
import { createApiHandler, isAdmin } from "@/lib/api/handler";
import { apiSuccess, apiError } from "@/lib/api/responses";
import {
  createRecruitingInvitation,
  getRecruitingInvitations,
} from "@/lib/assignments/recruiting-invitations";
import { createRecruitingInvitationSchema } from "@/lib/validators/recruiting-invitations";
import { recordAuditEvent } from "@/lib/audit/events";

export const GET = createApiHandler({
  handler: async (req: NextRequest, { user, params }) => {
    if (!isAdmin(user.role)) return apiError("forbidden", 403);

    const { assignmentId } = params;
    const url = new URL(req.url);
    const status = url.searchParams.get("status") ?? undefined;
    const search = url.searchParams.get("search") ?? undefined;

    const invitations = await getRecruitingInvitations(assignmentId, { status, search });
    return apiSuccess(invitations);
  },
});

export const POST = createApiHandler({
  rateLimit: "api-keys:create",
  schema: createRecruitingInvitationSchema,
  handler: async (req: NextRequest, { user, params, body }) => {
    if (!isAdmin(user.role)) return apiError("forbidden", 403);

    const { assignmentId } = params;
    const invitation = await createRecruitingInvitation({
      assignmentId,
      candidateName: body.candidateName,
      candidateEmail: body.candidateEmail,
      metadata: body.metadata,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      createdBy: user.id,
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
  },
});
