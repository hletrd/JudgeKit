import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const {
  getApiUserMock,
  consumeApiRateLimitMock,
  canAccessProblemMock,
  getStudentAssignmentContextsForProblemMock,
  validateAssignmentSubmissionMock,
  dbInsertValuesMock,
} = vi.hoisted(() => ({
  getApiUserMock: vi.fn(),
  consumeApiRateLimitMock: vi.fn(),
  canAccessProblemMock: vi.fn(),
  getStudentAssignmentContextsForProblemMock: vi.fn(),
  validateAssignmentSubmissionMock: vi.fn(),
  dbInsertValuesMock: vi.fn(),
}));

vi.mock("@/lib/api/auth", () => ({
  getApiUser: getApiUserMock,
  unauthorized: () => NextResponse.json({ error: "unauthorized" }, { status: 401 }),
  forbidden: () => NextResponse.json({ error: "forbidden" }, { status: 403 }),
  csrfForbidden: vi.fn(() => null),
}));

vi.mock("@/lib/security/api-rate-limit", () => ({
  consumeApiRateLimit: consumeApiRateLimitMock,
}));

vi.mock("@/lib/auth/permissions", () => ({
  canAccessProblem: canAccessProblemMock,
}));

vi.mock("@/lib/assignments/submissions", () => ({
  getStudentAssignmentContextsForProblem: getStudentAssignmentContextsForProblemMock,
  validateAssignmentSubmission: validateAssignmentSubmissionMock,
}));

vi.mock("@/lib/db", () => ({
  db: {
    insert: vi.fn(() => ({
      values: dbInsertValuesMock,
    })),
  },
}));

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost:3000/api/v1/code-snapshots", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
    },
    body: JSON.stringify(body),
  });
}

const studentUser = {
  id: "student-1",
  role: "student",
  username: "student",
  email: "student@example.com",
  name: "Student",
  className: null,
  mustChangePassword: false,
};

describe("POST /api/v1/code-snapshots", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getApiUserMock.mockResolvedValue(studentUser);
    consumeApiRateLimitMock.mockResolvedValue(null);
    canAccessProblemMock.mockResolvedValue(true);
    getStudentAssignmentContextsForProblemMock.mockResolvedValue([]);
    validateAssignmentSubmissionMock.mockResolvedValue({ ok: true });
    dbInsertValuesMock.mockResolvedValue(undefined);
  });

  it("returns 403 when the caller cannot access the target problem", async () => {
    canAccessProblemMock.mockResolvedValue(false);

    const { POST } = await import("@/app/api/v1/code-snapshots/route");
    const response = await POST(
      makeRequest({
        problemId: "problem-1",
        assignmentId: null,
        language: "python",
        sourceCode: 'print(\"hi\")',
      })
    );

    expect(response.status).toBe(403);
    expect(dbInsertValuesMock).not.toHaveBeenCalled();
  });

  it("returns 409 when a student omits assignmentId while assignment contexts exist", async () => {
    getStudentAssignmentContextsForProblemMock.mockResolvedValue([{ assignmentId: "assignment-1" }]);

    const { POST } = await import("@/app/api/v1/code-snapshots/route");
    const response = await POST(
      makeRequest({
        problemId: "problem-1",
        assignmentId: null,
        language: "python",
        sourceCode: 'print(\"hi\")',
      })
    );

    expect(response.status).toBe(409);
    expect(validateAssignmentSubmissionMock).not.toHaveBeenCalled();
    expect(dbInsertValuesMock).not.toHaveBeenCalled();
  });

  it("validates assignment context before writing a snapshot", async () => {
    validateAssignmentSubmissionMock.mockResolvedValue({
      ok: false,
      error: "forbidden",
      status: 403,
    });

    const { POST } = await import("@/app/api/v1/code-snapshots/route");
    const response = await POST(
      makeRequest({
        problemId: "problem-1",
        assignmentId: "assignment-1",
        language: "python",
        sourceCode: 'print(\"hi\")',
      })
    );

    expect(response.status).toBe(403);
    expect(dbInsertValuesMock).not.toHaveBeenCalled();
  });

  it("writes a snapshot when assignment and problem access checks pass", async () => {
    const { POST } = await import("@/app/api/v1/code-snapshots/route");
    const response = await POST(
      makeRequest({
        problemId: "problem-1",
        assignmentId: "assignment-1",
        language: "python",
        sourceCode: 'print(\"hi\")',
      })
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(validateAssignmentSubmissionMock).toHaveBeenCalledWith(
      "assignment-1",
      "problem-1",
      "student-1",
      "student"
    );
    expect(canAccessProblemMock).toHaveBeenCalledWith("problem-1", "student-1", "student");
    expect(dbInsertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "student-1",
        problemId: "problem-1",
        assignmentId: "assignment-1",
        language: "python",
        charCount: 11,
      })
    );
    expect(body.data).toEqual({ ok: true });
  });
});
