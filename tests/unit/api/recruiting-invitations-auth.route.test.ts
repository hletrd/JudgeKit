import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const {
  getContestAssignmentMock,
  canManageContestMock,
  getRecruitingInvitationsMock,
  getRecruitingInvitationMock,
} = vi.hoisted(() => ({
  getContestAssignmentMock: vi.fn(),
  canManageContestMock: vi.fn(),
  getRecruitingInvitationsMock: vi.fn(),
  getRecruitingInvitationMock: vi.fn(),
}));

vi.mock("@/lib/api/handler", () => ({
  createApiHandler:
    ({ handler }: { handler: (req: NextRequest, ctx: { user: any; body: any; params: Record<string, string> }) => Promise<Response> }) =>
    async (req: NextRequest, ctx?: { params?: Promise<Record<string, string>> }) =>
      handler(req, {
        user: { id: "manager-1", role: "reviewer" },
        body: req.method === "PATCH" || req.method === "POST" || req.method === "DELETE"
          ? await req.json().catch(() => undefined)
          : undefined,
        params:
          (await ctx?.params) ?? {
            assignmentId: "assignment-1",
            invitationId: "invite-1",
          },
      }),
}));

vi.mock("@/lib/api/responses", () => ({
  apiSuccess: (data: unknown, opts?: { status?: number }) =>
    NextResponse.json({ data }, { status: opts?.status ?? 200 }),
  apiError: (error: string, status: number, resource?: string) =>
    NextResponse.json(resource ? { error, resource } : { error }, { status }),
}));

vi.mock("@/lib/assignments/contests", () => ({
  getContestAssignment: getContestAssignmentMock,
  canManageContest: canManageContestMock,
}));

vi.mock("@/lib/db", () => ({
  execTransaction: vi.fn(),
}));

vi.mock("@/lib/assignments/recruiting-invitations", () => ({
  getRecruitingInvitations: getRecruitingInvitationsMock,
  getRecruitingInvitation: getRecruitingInvitationMock,
  updateRecruitingInvitation: vi.fn(),
  deleteRecruitingInvitation: vi.fn(),
  resetRecruitingInvitationAccountPassword: vi.fn(),
}));

vi.mock("@/lib/audit/events", () => ({
  recordAuditEvent: vi.fn(),
}));

describe("recruiting invitation assignment-scoped authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getContestAssignmentMock.mockResolvedValue({
      groupId: "group-1",
      instructorId: "instructor-1",
      examMode: "contest",
      enableAntiCheat: true,
      startsAt: null,
      deadline: null,
    });
    canManageContestMock.mockResolvedValue(true);
    getRecruitingInvitationsMock.mockResolvedValue([]);
    getRecruitingInvitationMock.mockResolvedValue({
      id: "invite-1",
      assignmentId: "assignment-1",
      candidateName: "Candidate",
      status: "pending",
    });
  });

  it("forbids list access when the actor cannot manage the target assignment", async () => {
    canManageContestMock.mockResolvedValue(false);

    const { GET } = await import(
      "@/app/api/v1/contests/[assignmentId]/recruiting-invitations/route"
    );
    const response = await GET(
      new NextRequest("http://localhost/api/v1/contests/assignment-1/recruiting-invitations"),
      { params: Promise.resolve({ assignmentId: "assignment-1" }) }
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "forbidden" });
    expect(getRecruitingInvitationsMock).not.toHaveBeenCalled();
  });

  it("returns not found when invitation path assignment does not match the invitation record", async () => {
    getRecruitingInvitationMock.mockResolvedValue({
      id: "invite-1",
      assignmentId: "assignment-2",
      candidateName: "Candidate",
      status: "pending",
    });

    const { GET } = await import(
      "@/app/api/v1/contests/[assignmentId]/recruiting-invitations/[invitationId]/route"
    );
    const response = await GET(
      new NextRequest("http://localhost/api/v1/contests/assignment-1/recruiting-invitations/invite-1"),
      {
        params: Promise.resolve({
          assignmentId: "assignment-1",
          invitationId: "invite-1",
        }),
      }
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "notFound",
      resource: "RecruitingInvitation",
    });
  });
});
