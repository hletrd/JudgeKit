import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  groupsFindFirstMock,
  assignmentsFindFirstMock,
  canManageGroupResourcesAsyncMock,
  extendExamSessionMock,
  recordAuditEventDurableMock,
} = vi.hoisted(() => ({
  groupsFindFirstMock: vi.fn(),
  assignmentsFindFirstMock: vi.fn(),
  canManageGroupResourcesAsyncMock: vi.fn(),
  extendExamSessionMock: vi.fn(),
  recordAuditEventDurableMock: vi.fn(),
}));

const GROUP_ID = "group-1";
const ASSIGNMENT_ID = "assign-1";
const TARGET_USER_ID = "student-9";

vi.mock("@/lib/api/handler", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/handler")>("@/lib/api/handler");
  return {
    ...actual,
    createApiHandler: ({
      handler,
      schema,
    }: {
      handler: (req: NextRequest, ctx: { user: unknown; params: unknown; body: unknown }) => Promise<Response>;
      schema?: { safeParse: (input: unknown) => { success: boolean; data?: unknown } };
    }) =>
      async (req: NextRequest) => {
        let body: unknown = undefined;
        if (schema) {
          const raw = await req.json().catch(() => ({}));
          const parsed = schema.safeParse(raw);
          if (!parsed.success) {
            return new Response(JSON.stringify({ error: "validation" }), { status: 400 });
          }
          body = parsed.data;
        }
        return handler(req, {
          user: { id: "instructor-1", role: "instructor", username: "instructor" },
          params: { id: GROUP_ID, assignmentId: ASSIGNMENT_ID, userId: TARGET_USER_ID },
          body,
        });
      },
  };
});

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      groups: { findFirst: groupsFindFirstMock },
      assignments: { findFirst: assignmentsFindFirstMock },
    },
  },
}));

vi.mock("@/lib/assignments/management", () => ({
  canManageGroupResourcesAsync: canManageGroupResourcesAsyncMock,
}));

vi.mock("@/lib/assignments/exam-sessions", () => ({
  extendExamSession: extendExamSessionMock,
}));

vi.mock("@/lib/audit/events", () => ({
  recordAuditEventDurable: recordAuditEventDurableMock,
}));

function makeRequest(body: unknown) {
  return new NextRequest(
    `http://localhost/api/v1/groups/${GROUP_ID}/assignments/${ASSIGNMENT_ID}/exam-sessions/${TARGET_USER_ID}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

describe("PATCH /groups/[id]/assignments/[assignmentId]/exam-sessions/[userId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    groupsFindFirstMock.mockResolvedValue({ id: GROUP_ID, instructorId: "instructor-1" });
    assignmentsFindFirstMock.mockResolvedValue({
      id: ASSIGNMENT_ID,
      groupId: GROUP_ID,
      examMode: "windowed",
      title: "Midterm",
    });
    canManageGroupResourcesAsyncMock.mockResolvedValue(true);
    extendExamSessionMock.mockResolvedValue({
      id: "session-1",
      assignmentId: ASSIGNMENT_ID,
      userId: TARGET_USER_ID,
      startedAt: new Date("2026-06-11T09:00:00.000Z"),
      personalDeadline: new Date("2026-06-11T10:15:00.000Z"),
    });
    recordAuditEventDurableMock.mockResolvedValue(undefined);
  });

  it("extends the participant's window and durably audits the grant", async () => {
    const { PATCH } = await import(
      "@/app/api/v1/groups/[id]/assignments/[assignmentId]/exam-sessions/[userId]/route"
    );
    const res = await PATCH(makeRequest({ extendMinutes: 15 }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(extendExamSessionMock).toHaveBeenCalledWith(ASSIGNMENT_ID, TARGET_USER_ID, 15);
    expect(body.data.session.personalDeadline).toBe("2026-06-11T10:15:00.000Z");
    // Grading-relevant state change → durable audit with full reconstruction data.
    expect(recordAuditEventDurableMock).toHaveBeenCalledTimes(1);
    expect(recordAuditEventDurableMock.mock.calls[0][0]).toMatchObject({
      action: "exam_session.extend",
      resourceType: "exam_session",
      details: {
        assignmentId: ASSIGNMENT_ID,
        targetUserId: TARGET_USER_ID,
        extendMinutes: 15,
      },
    });
  });

  it("rejects callers without group-management power (monitor-only staff cannot change time)", async () => {
    canManageGroupResourcesAsyncMock.mockResolvedValue(false);
    const { PATCH } = await import(
      "@/app/api/v1/groups/[id]/assignments/[assignmentId]/exam-sessions/[userId]/route"
    );
    const res = await PATCH(makeRequest({ extendMinutes: 15 }));

    expect(res.status).toBe(403);
    expect(extendExamSessionMock).not.toHaveBeenCalled();
    expect(recordAuditEventDurableMock).not.toHaveBeenCalled();
  });

  it("rejects non-windowed assignments (no per-participant window exists)", async () => {
    assignmentsFindFirstMock.mockResolvedValue({
      id: ASSIGNMENT_ID,
      groupId: GROUP_ID,
      examMode: "none",
      title: "Homework",
    });
    const { PATCH } = await import(
      "@/app/api/v1/groups/[id]/assignments/[assignmentId]/exam-sessions/[userId]/route"
    );
    const res = await PATCH(makeRequest({ extendMinutes: 15 }));

    expect(res.status).toBe(400);
    expect(extendExamSessionMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the participant never started the exam", async () => {
    extendExamSessionMock.mockResolvedValue(null);
    const { PATCH } = await import(
      "@/app/api/v1/groups/[id]/assignments/[assignmentId]/exam-sessions/[userId]/route"
    );
    const res = await PATCH(makeRequest({ extendMinutes: 15 }));

    expect(res.status).toBe(404);
    expect(recordAuditEventDurableMock).not.toHaveBeenCalled();
  });

  it("validates extendMinutes (rejects 0, negative, > 600, non-integer)", async () => {
    const { PATCH } = await import(
      "@/app/api/v1/groups/[id]/assignments/[assignmentId]/exam-sessions/[userId]/route"
    );
    for (const bad of [0, -5, 601, 2.5, "15"]) {
      const res = await PATCH(makeRequest({ extendMinutes: bad }));
      expect(res.status, `extendMinutes=${String(bad)} must be rejected`).toBe(400);
    }
    expect(extendExamSessionMock).not.toHaveBeenCalled();
  });
});
