/**
 * RPF cycle-3 AGG3-4: the exam-session GET is polled every 60 s by every
 * active windowed examinee (ExamDeadlineSync). The staff-visibility
 * resolution (canViewAssignmentSubmissions — several queries) must only run
 * when a cross-user read is actually requested (?userId= present and ≠ self);
 * semantics are unchanged (non-staff cross-reads silently fall back to self).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  assignmentsFindFirstMock,
  enrollmentsFindFirstMock,
  canAccessGroupMock,
  canViewAssignmentSubmissionsMock,
  getExamSessionMock,
} = vi.hoisted(() => ({
  assignmentsFindFirstMock: vi.fn(),
  enrollmentsFindFirstMock: vi.fn(),
  canAccessGroupMock: vi.fn(),
  canViewAssignmentSubmissionsMock: vi.fn(),
  getExamSessionMock: vi.fn(),
}));

const GROUP_ID = "group-1";
const ASSIGNMENT_ID = "assign-1";
const STUDENT_ID = "student-1";

vi.mock("@/lib/api/handler", () => ({
  createApiHandler:
    ({ handler }: { handler: (req: NextRequest, ctx: { user: unknown; params: unknown }) => Promise<Response> }) =>
    async (req: NextRequest) =>
      handler(req, {
        user: { id: STUDENT_ID, role: "student", username: "student" },
        params: { id: GROUP_ID, assignmentId: ASSIGNMENT_ID },
      }),
  forbidden: () => Response.json({ error: "forbidden" }, { status: 403 }),
  notFound: (what: string) => Response.json({ error: `${what} not found` }, { status: 404 }),
}));

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      assignments: { findFirst: assignmentsFindFirstMock },
      enrollments: { findFirst: enrollmentsFindFirstMock },
      groups: { findFirst: vi.fn() },
    },
  },
}));

vi.mock("@/lib/auth/permissions", () => ({
  canAccessGroup: canAccessGroupMock,
}));

vi.mock("@/lib/assignments/submissions", () => ({
  canViewAssignmentSubmissions: canViewAssignmentSubmissionsMock,
}));

vi.mock("@/lib/assignments/exam-sessions", () => ({
  startExamSession: vi.fn(),
  getExamSession: getExamSessionMock,
}));

vi.mock("@/lib/assignments/management", () => ({
  canManageGroupResourcesAsync: vi.fn(),
}));

vi.mock("@/lib/audit/events", () => ({
  recordAuditEvent: vi.fn(),
}));

vi.mock("@/lib/security/ip", () => ({
  extractClientIp: vi.fn(() => "127.0.0.1"),
}));

const SESSION = {
  id: "es-1",
  assignmentId: ASSIGNMENT_ID,
  userId: STUDENT_ID,
  startedAt: new Date("2026-06-11T10:00:00Z"),
  personalDeadline: new Date("2026-06-11T12:00:00Z"),
};

async function getSession(query = "") {
  const { GET } = await import(
    "@/app/api/v1/groups/[id]/assignments/[assignmentId]/exam-session/route"
  );
  const req = new NextRequest(
    `http://localhost/api/v1/groups/${GROUP_ID}/assignments/${ASSIGNMENT_ID}/exam-session${query}`
  );
  return GET(req, { params: Promise.resolve({}) });
}

describe("GET exam-session — lazy staff-visibility resolution (AGG3-4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    canAccessGroupMock.mockResolvedValue(true);
    assignmentsFindFirstMock.mockResolvedValue({
      id: ASSIGNMENT_ID,
      groupId: GROUP_ID,
      examMode: "windowed",
    });
    getExamSessionMock.mockResolvedValue(SESSION);
  });

  it("plain poll (no userId param) never resolves staff visibility", async () => {
    const res = await getSession();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.personalDeadline).toBe(SESSION.personalDeadline.toISOString());
    expect(canViewAssignmentSubmissionsMock).not.toHaveBeenCalled();
    expect(getExamSessionMock).toHaveBeenCalledWith(ASSIGNMENT_ID, STUDENT_ID);
  });

  it("self userId param skips the staff resolution too", async () => {
    const res = await getSession(`?userId=${STUDENT_ID}`);

    expect(res.status).toBe(200);
    expect(canViewAssignmentSubmissionsMock).not.toHaveBeenCalled();
    expect(getExamSessionMock).toHaveBeenCalledWith(ASSIGNMENT_ID, STUDENT_ID);
  });

  it("staff cross-read still resolves visibility and returns the target's session", async () => {
    canViewAssignmentSubmissionsMock.mockResolvedValue(true);
    enrollmentsFindFirstMock.mockResolvedValue({ id: "enr-2" });
    getExamSessionMock.mockResolvedValue({ ...SESSION, userId: "student-2" });

    const res = await getSession("?userId=student-2");

    expect(res.status).toBe(200);
    expect(canViewAssignmentSubmissionsMock).toHaveBeenCalledWith(
      ASSIGNMENT_ID,
      STUDENT_ID,
      "student"
    );
    expect(getExamSessionMock).toHaveBeenCalledWith(ASSIGNMENT_ID, "student-2");
  });

  it("non-staff cross-read silently falls back to self (pre-existing semantic preserved)", async () => {
    canViewAssignmentSubmissionsMock.mockResolvedValue(false);

    const res = await getSession("?userId=student-2");

    expect(res.status).toBe(200);
    expect(canViewAssignmentSubmissionsMock).toHaveBeenCalledTimes(1);
    // Fallback: own session, no enrollment probe for the requested user.
    expect(getExamSessionMock).toHaveBeenCalledWith(ASSIGNMENT_ID, STUDENT_ID);
    expect(enrollmentsFindFirstMock).not.toHaveBeenCalled();
  });
});
