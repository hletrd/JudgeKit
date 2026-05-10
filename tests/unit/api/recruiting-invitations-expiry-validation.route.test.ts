import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  getContestAssignmentMock,
  canManageContestMock,
  getDbNowUncachedMock,
  createRecruitingInvitationMock,
} = vi.hoisted(() => ({
  getContestAssignmentMock: vi.fn(),
  canManageContestMock: vi.fn(),
  getDbNowUncachedMock: vi.fn(),
  createRecruitingInvitationMock: vi.fn(),
}));

vi.mock("@/lib/api/handler", () => ({
  createApiHandler:
    ({ handler }: { handler: (req: NextRequest, ctx: { user: any; body: any; params: Record<string, string> }) => Promise<Response> }) =>
    async (req: NextRequest, ctx?: { params?: Promise<Record<string, string>> }) =>
      handler(req, {
        user: { id: "manager-1", role: "instructor" },
        body: req.method === "POST" ? await req.json().catch(() => undefined) : undefined,
        params: (await ctx?.params) ?? { assignmentId: "assignment-1" },
      }),
}));

vi.mock("@/lib/api/responses", () => ({
  apiSuccess: (data: unknown, opts?: { status?: number }) =>
    new Response(JSON.stringify({ data }), { status: opts?.status ?? 200 }),
  apiError: (error: string, status: number, resource?: string) =>
    new Response(JSON.stringify(resource ? { error, resource } : { error }), { status }),
}));

vi.mock("@/lib/assignments/contests", () => ({
  getContestAssignment: getContestAssignmentMock,
  canManageContest: canManageContestMock,
}));

vi.mock("@/lib/db-time", () => ({
  getDbNowUncached: getDbNowUncachedMock,
}));

function createMockTx() {
  const mockLimit = vi.fn().mockResolvedValue([]);
  const mockWhere = vi.fn(() => ({ limit: mockLimit }));
  const mockFrom = vi.fn(() => ({ where: mockWhere }));
  const mockSelect = vi.fn(() => ({ from: mockFrom }));
  return {
    select: mockSelect,
    execute: vi.fn(),
  };
}

vi.mock("@/lib/db", () => ({
  execTransaction: vi.fn((fn) => {
    const tx = createMockTx();
    return fn(tx);
  }),
}));

vi.mock("@/lib/assignments/recruiting-invitations", () => ({
  createRecruitingInvitation: createRecruitingInvitationMock,
}));

vi.mock("@/lib/audit/events", () => ({
  recordAuditEvent: vi.fn(),
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(() => ({})),
  and: vi.fn(() => ({})),
  sql: vi.fn((...args: unknown[]) => ({})),
}));

vi.mock("@/lib/db/schema", () => ({
  recruitingInvitations: {
    id: { name: "id" },
    assignmentId: { name: "assignment_id" },
    candidateEmail: { name: "candidate_email" },
  },
}));

describe("recruiting invitation expiryDate validation", () => {
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
    getDbNowUncachedMock.mockResolvedValue(new Date("2026-01-01T00:00:00Z"));
    createRecruitingInvitationMock.mockResolvedValue({
      id: "invite-1",
      assignmentId: "assignment-1",
      candidateName: "Candidate",
      status: "pending",
    });
  });

  it("rejects Invalid Date construction with 400 when expiryDate contains time component", async () => {
    const { POST } = await import(
      "@/app/api/v1/contests/[assignmentId]/recruiting-invitations/route"
    );
    const response = await POST(
      new NextRequest("http://localhost/api/v1/contests/assignment-1/recruiting-invitations", {
        method: "POST",
        body: JSON.stringify({
          candidateName: "Test",
          candidateEmail: "test@example.com",
          expiryDate: "2026-01-01T00:00:00Z",
        }),
      }),
      { params: Promise.resolve({ assignmentId: "assignment-1" }) }
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "invalidExpiryDate" });
    expect(createRecruitingInvitationMock).not.toHaveBeenCalled();
  });

  it("rejects expiryDate that produces Invalid Date with arbitrary string", async () => {
    const { POST } = await import(
      "@/app/api/v1/contests/[assignmentId]/recruiting-invitations/route"
    );
    const response = await POST(
      new NextRequest("http://localhost/api/v1/contests/assignment-1/recruiting-invitations", {
        method: "POST",
        body: JSON.stringify({
          candidateName: "Test",
          candidateEmail: "test@example.com",
          expiryDate: "not-a-date",
        }),
      }),
      { params: Promise.resolve({ assignmentId: "assignment-1" }) }
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "invalidExpiryDate" });
    expect(createRecruitingInvitationMock).not.toHaveBeenCalled();
  });

  it("accepts valid YYYY-MM-DD expiryDate", async () => {
    const { POST } = await import(
      "@/app/api/v1/contests/[assignmentId]/recruiting-invitations/route"
    );
    const response = await POST(
      new NextRequest("http://localhost/api/v1/contests/assignment-1/recruiting-invitations", {
        method: "POST",
        body: JSON.stringify({
          candidateName: "Test",
          candidateEmail: "test@example.com",
          expiryDate: "2026-12-31",
        }),
      }),
      { params: Promise.resolve({ assignmentId: "assignment-1" }) }
    );

    expect(response.status).toBe(201);
    expect(createRecruitingInvitationMock).toHaveBeenCalled();
  });

  it("rejects past expiryDate with 400", async () => {
    const { POST } = await import(
      "@/app/api/v1/contests/[assignmentId]/recruiting-invitations/route"
    );
    const response = await POST(
      new NextRequest("http://localhost/api/v1/contests/assignment-1/recruiting-invitations", {
        method: "POST",
        body: JSON.stringify({
          candidateName: "Test",
          candidateEmail: "test@example.com",
          expiryDate: "2020-01-01",
        }),
      }),
      { params: Promise.resolve({ assignmentId: "assignment-1" }) }
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "expiryDateInPast" });
    expect(createRecruitingInvitationMock).not.toHaveBeenCalled();
  });
});
