import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const {
  canViewAssignmentSubmissionsMock,
  getParticipantTimelineMock,
} = vi.hoisted(() => ({
  canViewAssignmentSubmissionsMock: vi.fn(),
  getParticipantTimelineMock: vi.fn(),
}));

vi.mock("@/lib/api/handler", () => ({
  createApiHandler:
    ({ handler }: { handler: (req: NextRequest, ctx: { user: any; params: Record<string, string> }) => Promise<Response> }) =>
    async (req: NextRequest, ctx?: { params?: Promise<Record<string, string>> }) =>
      handler(req, {
        user: { id: "reviewer-1", role: "reviewer" },
        params:
          (await ctx?.params) ?? {
            assignmentId: "assignment-1",
            userId: "student-1",
          },
      }),
}));

vi.mock("@/lib/api/responses", () => ({
  apiSuccess: (data: unknown, opts?: { status?: number }) =>
    NextResponse.json({ data }, { status: opts?.status ?? 200 }),
  apiError: (error: string, status: number) =>
    NextResponse.json({ error }, { status }),
}));

vi.mock("@/lib/assignments/submissions", () => ({
  canViewAssignmentSubmissions: canViewAssignmentSubmissionsMock,
}));

vi.mock("@/lib/assignments/participant-timeline", () => ({
  getParticipantTimeline: getParticipantTimelineMock,
}));

describe("GET /api/v1/contests/[assignmentId]/participant-timeline/[userId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    canViewAssignmentSubmissionsMock.mockResolvedValue(true);
    getParticipantTimelineMock.mockResolvedValue({
      participant: {
        userId: "student-1",
        username: "alice",
        name: "Alice",
        examStartedAt: "2026-04-19T00:00:00.000Z",
        personalDeadline: "2026-04-19T02:00:00.000Z",
        contestAccessAt: "2026-04-19T00:01:00.000Z",
      },
      problems: [],
      antiCheatSummary: { totalEvents: 0, byType: {} },
    });
  });

  it("returns 403 when the caller cannot view assignment submissions", async () => {
    canViewAssignmentSubmissionsMock.mockResolvedValue(false);

    const { GET } = await import(
      "@/app/api/v1/contests/[assignmentId]/participant-timeline/[userId]/route"
    );
    const response = await GET(
      new NextRequest("http://localhost/api/v1/contests/assignment-1/participant-timeline/student-1"),
      {
        params: Promise.resolve({
          assignmentId: "assignment-1",
          userId: "student-1",
        }),
      }
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "forbidden" });
    expect(getParticipantTimelineMock).not.toHaveBeenCalled();
  });

  it("returns the participant timeline after assignment-level authorization passes", async () => {
    const { GET } = await import(
      "@/app/api/v1/contests/[assignmentId]/participant-timeline/[userId]/route"
    );
    const response = await GET(
      new NextRequest("http://localhost/api/v1/contests/assignment-1/participant-timeline/student-1"),
      {
        params: Promise.resolve({
          assignmentId: "assignment-1",
          userId: "student-1",
        }),
      }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(canViewAssignmentSubmissionsMock).toHaveBeenCalledWith(
      "assignment-1",
      "reviewer-1",
      "reviewer"
    );
    expect(getParticipantTimelineMock).toHaveBeenCalledWith("assignment-1", "student-1");
    expect(body.data.participant).toMatchObject({
      userId: "student-1",
      username: "alice",
    });
  });
});
