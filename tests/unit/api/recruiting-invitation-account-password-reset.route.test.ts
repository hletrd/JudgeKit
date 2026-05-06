import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const {
  getInvitationMock,
  resetAccountPasswordMock,
  recordAuditEventMock,
} = vi.hoisted(() => ({
  getInvitationMock: vi.fn(),
  resetAccountPasswordMock: vi.fn(),
  recordAuditEventMock: vi.fn(),
}));

// Bypass createApiHandler's auth/CSRF/rate-limit middleware so the route's
// business logic runs synchronously in the test. This mirrors the canonical
// pattern used by recruiting-invitations-auth.route.test.ts.
vi.mock("@/lib/api/handler", () => ({
  createApiHandler:
    ({ handler, schema }: { handler: (req: NextRequest, ctx: { user: { id: string; role: string }; body: unknown; params: Record<string, string> }) => Promise<Response>; schema?: { parse: (input: unknown) => unknown } }) =>
    async (req: NextRequest, ctx?: { params?: Promise<Record<string, string>> }) => {
      const rawBody =
        req.method === "PATCH" || req.method === "POST" || req.method === "PUT" || req.method === "DELETE"
          ? await req.json().catch(() => undefined)
          : undefined;
      const body = schema ? schema.parse(rawBody) : rawBody;
      return handler(req, {
        user: { id: "admin-1", role: "admin" },
        body,
        params: (await ctx?.params) ?? { assignmentId: "assignment-1", invitationId: "invite-1" },
      });
    },
}));

vi.mock("@/lib/api/responses", () => ({
  apiSuccess: (data: unknown) => NextResponse.json({ data }, { status: 200 }),
  apiError: (error: string, status: number) => NextResponse.json({ error }, { status }),
}));

vi.mock("@/lib/assignments/recruiting-invitations", () => ({
  getRecruitingInvitation: getInvitationMock,
  updateRecruitingInvitation: vi.fn(),
  deleteRecruitingInvitation: vi.fn(),
  resetRecruitingInvitationResumeCode: vi.fn(),
  resetRecruitingInvitationAccountPassword: resetAccountPasswordMock,
}));

vi.mock("@/lib/assignments/contests", () => ({
  getContestAssignment: vi.fn(() => Promise.resolve({ id: "assignment-1", examMode: "scheduled", instructorId: "admin-1" })),
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
  execTransaction: vi.fn(),
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

describe("PATCH /api/v1/contests/[assignmentId]/recruiting-invitations/[invitationId] account password reset", () => {
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

  it("resets the recruiting account password for redeemed invitations", async () => {
    resetAccountPasswordMock.mockResolvedValue(undefined);

    const { PATCH } = await import("@/app/api/v1/contests/[assignmentId]/recruiting-invitations/[invitationId]/route");
    const res = await PATCH(makePatchRequest({ resetAccountPassword: true }), {
      params: Promise.resolve({ assignmentId: "assignment-1", invitationId: "invite-1" }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toEqual({ id: "invite-1", passwordResetRequired: true });
    expect(resetAccountPasswordMock).toHaveBeenCalledWith("invite-1");
    expect(recordAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "recruiting_invitation.account_password_reset" })
    );
  });
});
