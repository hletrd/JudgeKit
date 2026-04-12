import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  getInvitationMock,
  resetResumeCodeMock,
  updateInvitationMock,
  deleteInvitationMock,
  recordAuditEventMock,
} = vi.hoisted(() => ({
  getInvitationMock: vi.fn(),
  resetResumeCodeMock: vi.fn(),
  updateInvitationMock: vi.fn(),
  deleteInvitationMock: vi.fn(),
  recordAuditEventMock: vi.fn(),
}));

vi.mock("@/lib/api/handler", () => ({
  createApiHandler:
    ({ handler }: { handler: (req: NextRequest, ctx: { user: any; body: any; params: Record<string, string> }) => Promise<Response> }) =>
    async (req: NextRequest, ctx?: { params?: Promise<Record<string, string>> }) =>
      handler(req, {
        user: { id: "admin-1", role: "admin", username: "admin" },
        body: req.method === "PATCH" ? await req.json() : undefined,
        params: (await ctx?.params) ?? { assignmentId: "assignment-1", invitationId: "invite-1" },
      }),
}));

vi.mock("@/lib/assignments/recruiting-invitations", () => ({
  getRecruitingInvitation: getInvitationMock,
  updateRecruitingInvitation: updateInvitationMock,
  deleteRecruitingInvitation: deleteInvitationMock,
  resetRecruitingInvitationResumeCode: resetResumeCodeMock,
}));

vi.mock("@/lib/audit/events", () => ({
  recordAuditEvent: recordAuditEventMock,
}));

function makePatchRequest(body: unknown) {
  return new NextRequest("http://localhost/api/v1/contests/assignment-1/recruiting-invitations/invite-1", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
    },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/v1/contests/[assignmentId]/recruiting-invitations/[invitationId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getInvitationMock.mockResolvedValue({
      id: "invite-1",
      candidateName: "Candidate One",
      status: "redeemed",
      userId: "user-1",
      metadata: { resumeCodeHash: "hash" },
    });
  });

  it("resets the resume code for redeemed invitations and returns it once", async () => {
    resetResumeCodeMock.mockResolvedValue("fresh-resume-code");

    const { PATCH } = await import("@/app/api/v1/contests/[assignmentId]/recruiting-invitations/[invitationId]/route");
    const res = await PATCH(makePatchRequest({ resetResumeCode: true }), {
      params: Promise.resolve({ assignmentId: "assignment-1", invitationId: "invite-1" }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toEqual({ id: "invite-1", resumeCode: "fresh-resume-code" });
    expect(resetResumeCodeMock).toHaveBeenCalledWith("invite-1");
    expect(recordAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "recruiting_invitation.resume_code_reset" })
    );
    expect(updateInvitationMock).not.toHaveBeenCalled();
  });

  it("rejects resume-code resets for non-redeemed invitations", async () => {
    getInvitationMock.mockResolvedValueOnce({
      id: "invite-1",
      candidateName: "Candidate One",
      status: "pending",
      userId: null,
      metadata: {},
    });

    const { PATCH } = await import("@/app/api/v1/contests/[assignmentId]/recruiting-invitations/[invitationId]/route");
    const res = await PATCH(makePatchRequest({ resetResumeCode: true }), {
      params: Promise.resolve({ assignmentId: "assignment-1", invitationId: "invite-1" }),
    });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("resumeCodeResetRequiresRedeemed");
    expect(resetResumeCodeMock).not.toHaveBeenCalled();
  });
});
