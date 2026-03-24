import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Hoisted mocks — must be declared before any module imports
// ---------------------------------------------------------------------------
const {
  getApiUserMock,
  csrfForbiddenMock,
  submissionsFindFirstMock,
  problemsFindFirstMock,
  languageConfigsFindFirstMock,
  selectMock,
  insertMock,
  recordAuditEventMock,
  getStudentAssignmentContextsForProblemMock,
  validateAssignmentSubmissionMock,
  canAccessProblemMock,
  generateSubmissionIdMock,
  resolveCapabilitiesMock,
} = vi.hoisted(() => ({
  getApiUserMock: vi.fn(),
  csrfForbiddenMock: vi.fn(),
  submissionsFindFirstMock: vi.fn(),
  problemsFindFirstMock: vi.fn(),
  languageConfigsFindFirstMock: vi.fn(),
  selectMock: vi.fn(),
  insertMock: vi.fn(),
  recordAuditEventMock: vi.fn(),
  getStudentAssignmentContextsForProblemMock: vi.fn(),
  validateAssignmentSubmissionMock: vi.fn(),
  canAccessProblemMock: vi.fn(),
  generateSubmissionIdMock: vi.fn(),
  resolveCapabilitiesMock: vi.fn(),
}));

vi.mock("@/lib/api/auth", () => ({
  getApiUser: getApiUserMock,
  csrfForbidden: csrfForbiddenMock,
  unauthorized: () => Response.json({ error: "unauthorized" }, { status: 401 }),
  isAdmin: (role: string) => role === "admin" || role === "super_admin",
}));

vi.mock("@/lib/audit/events", () => ({
  recordAuditEvent: recordAuditEventMock,
}));

vi.mock("@/lib/assignments/submissions", () => ({
  getStudentAssignmentContextsForProblem: getStudentAssignmentContextsForProblemMock,
  validateAssignmentSubmission: validateAssignmentSubmissionMock,
}));

vi.mock("@/lib/auth/permissions", () => ({
  canAccessProblem: canAccessProblemMock,
}));

vi.mock("@/lib/submissions/id", () => ({
  generateSubmissionId: generateSubmissionIdMock,
}));

vi.mock("@/lib/capabilities/cache", () => ({
  resolveCapabilities: resolveCapabilitiesMock,
  invalidateRoleCache: vi.fn(),
  getRoleLevel: vi.fn().mockResolvedValue(0),
  isValidRole: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/security/api-rate-limit", () => ({
  consumeApiRateLimit: vi.fn().mockReturnValue(null),
}));

vi.mock("@/lib/db", () => {
  const insertChain = { values: vi.fn(() => ({ returning: insertMock })) };
  return {
    db: {
      query: {
        submissions: { findFirst: submissionsFindFirstMock },
        problems: { findFirst: problemsFindFirstMock },
        languageConfigs: { findFirst: languageConfigsFindFirstMock },
      },
      select: selectMock,
      insert: vi.fn(() => insertChain),
    },
  };
});

// Import the handler AFTER all mocks are set up
import { POST } from "@/app/api/v1/submissions/route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(body: unknown, extraHeaders: Record<string, string> = {}) {
  return new NextRequest("http://localhost:3000/api/v1/submissions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-csrf-token": "valid",
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  });
}

/** Build a chained select mock that returns the supplied rows */
function mockSelectCount(count: number) {
  return vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([{ count }]),
    }),
  });
}

const VALID_USER = { id: "user-1", role: "student", username: "alice" };
const VALID_BODY = {
  problemId: "problem-1",
  language: "python",
  sourceCode: 'print("hello")',
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(async () => {
  vi.clearAllMocks();

  resolveCapabilitiesMock.mockImplementation(async (role: string) => {
    const { DEFAULT_ROLE_CAPABILITIES } = await import("@/lib/capabilities/defaults");
    const caps = DEFAULT_ROLE_CAPABILITIES[role as keyof typeof DEFAULT_ROLE_CAPABILITIES];
    return new Set(caps ?? []);
  });

  // CSRF passes by default
  csrfForbiddenMock.mockReturnValue(null);

  // Authenticated user by default
  getApiUserMock.mockResolvedValue(VALID_USER);

  // Rate limit / pending / global queue all within limits (return 0)
  selectMock.mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([{ count: 0 }]),
    }),
  });

  // Problem exists
  problemsFindFirstMock.mockResolvedValue({ id: "problem-1", title: "Hello World" });

  // Language enabled
  languageConfigsFindFirstMock.mockResolvedValue({ id: "lc-1" });

  // No assignment context required for student (no active assignments)
  getStudentAssignmentContextsForProblemMock.mockResolvedValue([]);

  // Problem is accessible
  canAccessProblemMock.mockResolvedValue(true);

  // Submission ID generator
  generateSubmissionIdMock.mockReturnValue("submission-abc123");

  // DB insert succeeds — .returning() must yield an array for destructuring
  insertMock.mockResolvedValue([{
    id: "submission-abc123",
    userId: "user-1",
    problemId: "problem-1",
    language: "python",
    status: "pending",
  }]);

  // Inserted submission returned by findFirst
  submissionsFindFirstMock.mockResolvedValue({
    id: "submission-abc123",
    userId: "user-1",
    problemId: "problem-1",
    assignmentId: null,
    language: "python",
    status: "pending",
    executionTimeMs: null,
    memoryUsedKb: null,
    score: null,
    judgedAt: null,
    submittedAt: new Date(),
  });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/v1/submissions", () => {
  it("creates a submission successfully and returns 201", async () => {
    const response = await POST(makeRequest(VALID_BODY));
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.data).toMatchObject({
      id: "submission-abc123",
      userId: "user-1",
      problemId: "problem-1",
      language: "python",
      status: "pending",
    });
    expect(recordAuditEventMock).toHaveBeenCalledOnce();
  });

  it("returns 401 when not authenticated", async () => {
    getApiUserMock.mockResolvedValue(null);

    const response = await POST(makeRequest(VALID_BODY));

    expect(response.status).toBe(401);
  });

  it("returns 403 when CSRF check fails", async () => {
    csrfForbiddenMock.mockReturnValue(
      Response.json({ error: "forbidden" }, { status: 403 })
    );

    const response = await POST(makeRequest(VALID_BODY));

    expect(response.status).toBe(403);
  });

  it("returns 400 when problemId is empty", async () => {
    // trimString passes "" through unchanged; .min(1) then fires the custom message
    const response = await POST(makeRequest({ problemId: "", language: "python", sourceCode: "x=1" }));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe("problemRequired");
  });

  it("returns 400 when language is empty", async () => {
    const response = await POST(makeRequest({ problemId: "p-1", language: "", sourceCode: "x=1" }));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe("languageRequired");
  });

  it("returns 400 when sourceCode is empty", async () => {
    const response = await POST(makeRequest({ problemId: "p-1", language: "python", sourceCode: "" }));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe("sourceCodeRequired");
  });

  it("returns 400 for an unsupported/unknown language", async () => {
    const response = await POST(
      makeRequest({ ...VALID_BODY, language: "nonexistent_lang" })
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe("languageNotSupported");
  });

  it("returns 413 when source code exceeds the byte limit", async () => {
    // MAX_SOURCE_CODE_SIZE_BYTES = 256 * 1024 = 262144 bytes
    const hugeSource = "x".repeat(262145);
    // The schema's .max() check fires first (character count ≥ byte count for ASCII)
    const response = await POST(makeRequest({ ...VALID_BODY, sourceCode: hugeSource }));
    const payload = await response.json();

    // Schema may reject with sourceCodeTooLarge (400) or the byte check returns 413
    expect([400, 413]).toContain(response.status);
    expect(payload.error).toBe("sourceCodeTooLarge");
  });

  it("returns 404 when the problem does not exist", async () => {
    problemsFindFirstMock.mockResolvedValue(null);

    const response = await POST(makeRequest(VALID_BODY));
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload.error).toBe("problemNotFound");
  });

  it("returns 400 when the language is not enabled in languageConfigs", async () => {
    languageConfigsFindFirstMock.mockResolvedValue(null);

    const response = await POST(makeRequest(VALID_BODY));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe("languageNotSupported");
  });

  it("returns 403 when user does not have access to the problem", async () => {
    canAccessProblemMock.mockResolvedValue(false);

    const response = await POST(makeRequest(VALID_BODY));
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe("forbidden");
  });

  it("returns 429 when per-user rate limit is exceeded", async () => {
    // First select call = recent submissions count (at limit), subsequent calls = 0
    let callCount = 0;
    selectMock.mockImplementation(() => {
      callCount++;
      const count = callCount === 1 ? 5 : 0; // SUBMISSION_RATE_LIMIT_MAX_PER_MINUTE default = 5
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count }]),
        }),
      };
    });

    const response = await POST(makeRequest(VALID_BODY));
    const payload = await response.json();

    expect(response.status).toBe(429);
    expect(payload.error).toBe("submissionRateLimited");
    expect(response.headers.get("Retry-After")).toBe("60");
  });

  it("returns 429 when per-user pending submission limit is exceeded", async () => {
    let callCount = 0;
    selectMock.mockImplementation(() => {
      callCount++;
      // 1st select = recent submissions (under limit), 2nd = pending count (at limit)
      const count = callCount === 2 ? 3 : 0; // SUBMISSION_MAX_PENDING default = 3
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count }]),
        }),
      };
    });

    const response = await POST(makeRequest(VALID_BODY));
    const payload = await response.json();

    expect(response.status).toBe(429);
    expect(payload.error).toBe("tooManyPendingSubmissions");
    expect(response.headers.get("Retry-After")).toBe("10");
  });

  it("returns 503 when the global judge queue is full", async () => {
    let callCount = 0;
    selectMock.mockImplementation(() => {
      callCount++;
      // 1st = recent (0), 2nd = pending (0), 3rd = global queue (at limit)
      const count = callCount === 3 ? 100 : 0; // SUBMISSION_GLOBAL_QUEUE_LIMIT default = 100
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count }]),
        }),
      };
    });

    const response = await POST(makeRequest(VALID_BODY));
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload.error).toBe("judgeQueueFull");
    expect(response.headers.get("Retry-After")).toBe("30");
  });

  it("returns 409 when a student submits without assignmentId but has active assignments", async () => {
    getStudentAssignmentContextsForProblemMock.mockResolvedValue([
      { assignmentId: "assign-1", title: "HW1", groupId: "group-1" },
    ]);

    const response = await POST(makeRequest(VALID_BODY));
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.error).toBe("assignmentContextRequired");
  });

  it("passes assignment validation when assignmentId is provided and valid", async () => {
    validateAssignmentSubmissionMock.mockResolvedValue({
      ok: true,
      assignment: { id: "assign-1", groupId: "group-1", instructorId: "inst-1" },
    });

    const response = await POST(
      makeRequest({ ...VALID_BODY, assignmentId: "assign-1" })
    );
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(validateAssignmentSubmissionMock).toHaveBeenCalledWith(
      "assign-1",
      "problem-1",
      "user-1",
      "student"
    );
    expect(payload.data.id).toBe("submission-abc123");
  });

  it("returns assignment validation error when assignment validation fails", async () => {
    validateAssignmentSubmissionMock.mockResolvedValue({
      ok: false,
      status: 403,
      error: "assignmentClosed",
    });

    const response = await POST(
      makeRequest({ ...VALID_BODY, assignmentId: "assign-expired" })
    );
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe("assignmentClosed");
  });

  it("does not call assignment context check for admin users", async () => {
    getApiUserMock.mockResolvedValue({ id: "admin-1", role: "admin", username: "admin" });

    const response = await POST(makeRequest(VALID_BODY));

    expect(response.status).toBe(201);
    // Admin role skips the student assignment context check
    expect(getStudentAssignmentContextsForProblemMock).not.toHaveBeenCalled();
  });

  it("does not fire audit event when post-insert findFirst returns null", async () => {
    // Override: insert succeeds but findFirst returns null (edge case)
    submissionsFindFirstMock
      .mockResolvedValueOnce(null); // the lookup after insert

    const response = await POST(makeRequest(VALID_BODY));
    // Still returns 201 with null data
    expect(response.status).toBe(201);
    expect(recordAuditEventMock).not.toHaveBeenCalled();
  });
});
