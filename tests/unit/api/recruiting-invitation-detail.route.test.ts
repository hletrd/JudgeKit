import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const {
  getInvitationMock,
  updateInvitationMock,
  deleteInvitationMock,
  regenerateInvitationMock,
  dispatchEmailMock,
  recordAuditEventMock,
} = vi.hoisted(() => ({
  getInvitationMock: vi.fn(),
  updateInvitationMock: vi.fn(),
  deleteInvitationMock: vi.fn(),
  regenerateInvitationMock: vi.fn(),
  dispatchEmailMock: vi.fn(),
  recordAuditEventMock: vi.fn(),
}));

vi.mock("@/lib/api/auth", () => ({
  getApiUser: vi.fn(() => Promise.resolve({ id: "admin-1", role: "admin", username: "admin" })),
  csrfForbidden: vi.fn(() => null),
  unauthorized: () => NextResponse.json({ error: "unauthorized" }, { status: 401 }),
  forbidden: () => NextResponse.json({ error: "forbidden" }, { status: 403 }),
  notFound: (resource: string) => NextResponse.json({ error: "notFound", resource }, { status: 404 }),
}));

vi.mock("@/lib/api/responses", () => ({
  apiSuccess: (data: unknown) => NextResponse.json({ data }, { status: 200 }),
  apiError: (error: string, status: number) => NextResponse.json({ error }, { status }),
}));

vi.mock("@/lib/capabilities/cache", () => ({
  resolveCapabilities: async () => ({
    has: () => true,
  }),
}));

vi.mock("@/lib/assignments/recruiting-invitations", () => ({
  getRecruitingInvitation: getInvitationMock,
  updateRecruitingInvitation: updateInvitationMock,
  deleteRecruitingInvitation: deleteInvitationMock,
  regenerateRecruitingInvitationToken: regenerateInvitationMock,
}));

vi.mock("@/lib/email/recruiting", () => ({
  dispatchRecruitingInvitationEmail: dispatchEmailMock,
}));

vi.mock("@/lib/security/env", () => ({
  getPublicBaseUrl: () => "https://example.com",
}));

vi.mock("@/lib/assignments/contests", () => ({
  getContestAssignment: vi.fn(() => Promise.resolve({ id: "assignment-1", title: "Backend Hiring Test", examMode: "scheduled", instructorId: "admin-1" })),
  canManageContest: vi.fn(() => Promise.resolve(true)),
}));

vi.mock("@/lib/audit/events", () => ({
  recordAuditEvent: recordAuditEventMock,
}));

vi.mock("@/lib/db", () => ({
  db: {
    update: vi.fn(() => ({ where: vi.fn(), set: vi.fn(() => ({ then: vi.fn(cb => cb([])) })) })),
    delete: vi.fn(() => ({ where: vi.fn(() => ({ then: vi.fn(cb => cb()) })) })),
  },
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
      assignmentId: "assignment-1",
      candidateName: "Candidate One",
      status: "redeemed",
      userId: "user-1",
      metadata: { resumeCodeHash: "hash" },
    });
  });

  it("updates invitation metadata when provided", async () => {
    const { PATCH } = await import("@/app/api/v1/contests/[assignmentId]/recruiting-invitations/[invitationId]/route");
    const res = await PATCH(makePatchRequest({ metadata: { key: "value" } }), {
      params: Promise.resolve({ assignmentId: "assignment-1", invitationId: "invite-1" }),
    });

    expect(res.status).toBe(200);
    expect(updateInvitationMock).toHaveBeenCalledWith("invite-1", {
      metadata: { key: "value" },
    });
  });

  it("re-issues the link for a pending invitation and returns the fresh token", async () => {
    getInvitationMock.mockResolvedValue({
      id: "invite-1",
      assignmentId: "assignment-1",
      candidateName: "Candidate One",
      candidateEmail: "candidate@example.com",
      status: "pending",
      userId: null,
      metadata: {},
    });
    regenerateInvitationMock.mockResolvedValue({
      id: "invite-1",
      token: "fresh-token-xyz",
      candidateEmail: "candidate@example.com",
      expiresAt: null,
    });

    const { PATCH } = await import("@/app/api/v1/contests/[assignmentId]/recruiting-invitations/[invitationId]/route");
    const res = await PATCH(makePatchRequest({ regenerateToken: true }), {
      params: Promise.resolve({ assignmentId: "assignment-1", invitationId: "invite-1" }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.token).toBe("fresh-token-xyz");
    expect(regenerateInvitationMock).toHaveBeenCalledWith("invite-1");
    // Email re-sent with the NEW link (the dispatcher itself gates on SMTP config).
    expect(dispatchEmailMock).toHaveBeenCalledTimes(1);
    expect(dispatchEmailMock.mock.calls[0][0]).toMatchObject({
      to: "candidate@example.com",
      accessUrl: "https://example.com/recruit/fresh-token-xyz",
    });
  });

  it("rejects re-issuing a non-pending (redeemed) invitation", async () => {
    // The default beforeEach invitation is redeemed.
    const { PATCH } = await import("@/app/api/v1/contests/[assignmentId]/recruiting-invitations/[invitationId]/route");
    const res = await PATCH(makePatchRequest({ regenerateToken: true }), {
      params: Promise.resolve({ assignmentId: "assignment-1", invitationId: "invite-1" }),
    });

    expect(res.status).toBe(400);
    expect(regenerateInvitationMock).not.toHaveBeenCalled();
    expect(dispatchEmailMock).not.toHaveBeenCalled();
  });

  it("does not re-send email when the candidate has no email on file", async () => {
    getInvitationMock.mockResolvedValue({
      id: "invite-1",
      assignmentId: "assignment-1",
      candidateName: "No Email",
      candidateEmail: null,
      status: "pending",
      userId: null,
      metadata: {},
    });
    regenerateInvitationMock.mockResolvedValue({
      id: "invite-1",
      token: "tok2",
      candidateEmail: null,
      expiresAt: null,
    });

    const { PATCH } = await import("@/app/api/v1/contests/[assignmentId]/recruiting-invitations/[invitationId]/route");
    const res = await PATCH(makePatchRequest({ regenerateToken: true }), {
      params: Promise.resolve({ assignmentId: "assignment-1", invitationId: "invite-1" }),
    });

    expect(res.status).toBe(200);
    expect(dispatchEmailMock).not.toHaveBeenCalled();
  });
});
