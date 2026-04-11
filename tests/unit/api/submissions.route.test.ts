import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const {
  getApiUserMock,
  csrfForbiddenMock,
  consumeApiRateLimitMock,
  dbSelectMock,
  dbInsertMock,
  recordAuditEventMock,
  getStudentAssignmentContextsForProblemMock,
  validateAssignmentSubmissionMock,
  canAccessProblemMock,
  generateSubmissionIdMock,
  resolveCapabilitiesMock,
} = vi.hoisted(() => ({
  getApiUserMock: vi.fn(),
  csrfForbiddenMock: vi.fn(),
  consumeApiRateLimitMock: vi.fn(),
  dbSelectMock: vi.fn(),
  dbInsertMock: vi.fn(),
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
  unauthorized: () => NextResponse.json({ error: "unauthorized" }, { status: 401 }),
  forbidden: () => NextResponse.json({ error: "forbidden" }, { status: 403 }),
  isAdmin: (role: string) => role === "admin" || role === "super_admin",
}));

vi.mock("@/lib/security/api-rate-limit", () => ({
  consumeApiRateLimit: consumeApiRateLimitMock,
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

const dbMockObj = {
  select: dbSelectMock,
  insert: vi.fn(() => ({ values: dbInsertMock })),
  query: { submissions: { findFirst: vi.fn(), findMany: vi.fn() } },
  execute: vi.fn().mockResolvedValue(undefined),
};

vi.mock("@/lib/db", () => ({
  db: dbMockObj,
  execTransaction: vi.fn(async (fn: (tx: typeof dbMockObj) => unknown) => fn(dbMockObj)),
}));

function makeRequest(body: unknown, extraHeaders: Record<string, string> = {}) {
  return new NextRequest("http://localhost:3000/api/v1/submissions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  });
}

function makeGetRequest(search = "") {
  return new NextRequest(`http://localhost:3000/api/v1/submissions${search}`, {
    method: "GET",
  });
}

function makeSelectChain(result: unknown) {
  const chain = {
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
    then: vi.fn(),
  };
  chain.from.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  chain.limit.mockImplementation(() => result);
  chain.then.mockImplementation((resolve: (value: unknown) => unknown) => Promise.resolve(resolve(result)));
  return chain;
}

function queueSelectResults(results: unknown[]) {
  dbSelectMock.mockImplementation(() => {
    const next = results.shift();
    return makeSelectChain(next);
  });
}

const VALID_USER = {
  id: "user-1",
  role: "student",
  username: "alice",
  email: "alice@example.com",
  name: "Alice",
  className: null,
  mustChangePassword: false,
};

const VALID_BODY = {
  problemId: "problem-1",
  language: "python",
  sourceCode: 'print("hello")',
};

describe("POST /api/v1/submissions", () => {
  beforeEach(async () => {
    vi.clearAllMocks();

    resolveCapabilitiesMock.mockImplementation(async (role: string) => {
      const { DEFAULT_ROLE_CAPABILITIES } = await import("@/lib/capabilities/defaults");
      const caps = DEFAULT_ROLE_CAPABILITIES[role as keyof typeof DEFAULT_ROLE_CAPABILITIES];
      return new Set(caps ?? []);
    });

    csrfForbiddenMock.mockReturnValue(null);
    consumeApiRateLimitMock.mockResolvedValue(null);
    getApiUserMock.mockResolvedValue(VALID_USER);
    getStudentAssignmentContextsForProblemMock.mockResolvedValue([]);
    validateAssignmentSubmissionMock.mockResolvedValue({ ok: true });
    canAccessProblemMock.mockResolvedValue(true);
    generateSubmissionIdMock.mockReturnValue("submission-abc123");
    dbInsertMock.mockResolvedValue(undefined);

    queueSelectResults([
      [{ id: "problem-1", title: "Hello World" }],
      [{ id: "lc-1" }],
      [{ recentCount: 0, pendingCount: 0 }],
      [{ count: 0 }],
      [{
        id: "submission-abc123",
        userId: "user-1",
        problemId: "problem-1",
        assignmentId: null,
        language: "python",
        status: "pending",
        compileOutput: null,
        executionTimeMs: null,
        memoryUsedKb: null,
        score: null,
        judgedAt: null,
        submittedAt: new Date(),
      }],
      [{
        id: "submission-abc123",
        userId: "user-1",
        problemId: "problem-1",
        assignmentId: null,
        language: "python",
        status: "pending",
        compileOutput: null,
        executionTimeMs: null,
        memoryUsedKb: null,
        score: null,
        judgedAt: null,
        submittedAt: new Date(),
      }],
    ]);
  });

  it("creates a submission successfully and returns 201", async () => {
    const { POST } = await import("@/app/api/v1/submissions/route");
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
    const { POST } = await import("@/app/api/v1/submissions/route");

    const response = await POST(makeRequest(VALID_BODY));
    expect(response.status).toBe(401);
  });

  it("returns 403 when CSRF check fails", async () => {
    csrfForbiddenMock.mockReturnValue(NextResponse.json({ error: "forbidden" }, { status: 403 }));
    const { POST } = await import("@/app/api/v1/submissions/route");

    const response = await POST(makeRequest(VALID_BODY));
    expect(response.status).toBe(403);
  });

  it("returns 400 when problemId is empty", async () => {
    const { POST } = await import("@/app/api/v1/submissions/route");
    const response = await POST(makeRequest({ problemId: "", language: "python", sourceCode: "x=1" }));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe("problemRequired");
  });

  it("returns 400 when language is empty", async () => {
    const { POST } = await import("@/app/api/v1/submissions/route");
    const response = await POST(makeRequest({ problemId: "p-1", language: "", sourceCode: "x=1" }));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe("languageRequired");
  });

  it("returns 400 when sourceCode is empty", async () => {
    const { POST } = await import("@/app/api/v1/submissions/route");
    const response = await POST(makeRequest({ problemId: "p-1", language: "python", sourceCode: "" }));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe("sourceCodeRequired");
  });

  it("returns 400 for an unsupported/unknown language", async () => {
    const { POST } = await import("@/app/api/v1/submissions/route");
    const response = await POST(makeRequest({ ...VALID_BODY, language: "nonexistent_lang" }));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe("languageNotSupported");
  });

  it("returns 413 when source code exceeds the byte limit", async () => {
    const hugeSource = "x".repeat(262145);
    const { POST } = await import("@/app/api/v1/submissions/route");
    const response = await POST(makeRequest({ ...VALID_BODY, sourceCode: hugeSource }));
    const payload = await response.json();

    expect([400, 413]).toContain(response.status);
    expect(payload.error).toBe("sourceCodeTooLarge");
  });

  it("returns 404 when the problem does not exist", async () => {
    queueSelectResults([
      [],
      [{ id: "lc-1" }],
    ]);
    const { POST } = await import("@/app/api/v1/submissions/route");

    const response = await POST(makeRequest(VALID_BODY));
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload.error).toBe("problemNotFound");
  });

  it("returns 400 when the language is not enabled in languageConfigs", async () => {
    queueSelectResults([
      [{ id: "problem-1", title: "Hello World" }],
      [],
    ]);
    const { POST } = await import("@/app/api/v1/submissions/route");

    const response = await POST(makeRequest(VALID_BODY));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe("languageNotSupported");
  });

  it("returns 403 when user does not have access to the problem", async () => {
    canAccessProblemMock.mockResolvedValue(false);
    const { POST } = await import("@/app/api/v1/submissions/route");

    const response = await POST(makeRequest(VALID_BODY));
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe("forbidden");
  });

  it("returns 429 when per-user rate limit is exceeded", async () => {
    queueSelectResults([
      [{ id: "problem-1", title: "Hello World" }],
      [{ id: "lc-1" }],
      [{ recentCount: 120, pendingCount: 0 }],
    ]);
    const { POST } = await import("@/app/api/v1/submissions/route");

    const response = await POST(makeRequest(VALID_BODY));
    const payload = await response.json();

    expect(response.status).toBe(429);
    expect(payload.error).toBe("submissionRateLimited");
    expect(response.headers.get("Retry-After")).toBe("60");
  });

  it("returns 429 when per-user pending submission limit is exceeded", async () => {
    queueSelectResults([
      [{ id: "problem-1", title: "Hello World" }],
      [{ id: "lc-1" }],
      [{ recentCount: 0, pendingCount: 3 }],
    ]);
    const { POST } = await import("@/app/api/v1/submissions/route");

    const response = await POST(makeRequest(VALID_BODY));
    const payload = await response.json();

    expect(response.status).toBe(429);
    expect(payload.error).toBe("tooManyPendingSubmissions");
    expect(response.headers.get("Retry-After")).toBe("10");
  });

  it("returns 503 when the global judge queue is full", async () => {
    queueSelectResults([
      [{ id: "problem-1", title: "Hello World" }],
      [{ id: "lc-1" }],
      [{ recentCount: 0, pendingCount: 0 }],
      [{ count: 100 }],
    ]);
    const { POST } = await import("@/app/api/v1/submissions/route");

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
    const { POST } = await import("@/app/api/v1/submissions/route");

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
    queueSelectResults([
      [{ id: "problem-1", title: "Hello World" }],
      [{ id: "lc-1" }],
      [{ recentCount: 0, pendingCount: 0 }],
      [{ count: 0 }],
      [],
      [{
        id: "submission-abc123",
        userId: "user-1",
        problemId: "problem-1",
        assignmentId: "assign-1",
        language: "python",
        status: "pending",
        compileOutput: null,
        executionTimeMs: null,
        memoryUsedKb: null,
        score: null,
        judgedAt: null,
        submittedAt: new Date(),
      }],
      [{
        id: "submission-abc123",
        userId: "user-1",
        problemId: "problem-1",
        assignmentId: "assign-1",
        language: "python",
        status: "pending",
        compileOutput: null,
        executionTimeMs: null,
        memoryUsedKb: null,
        score: null,
        judgedAt: null,
        submittedAt: new Date(),
      }],
    ]);
    const { POST } = await import("@/app/api/v1/submissions/route");

    const response = await POST(makeRequest({ ...VALID_BODY, assignmentId: "assign-1" }));
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
    const { POST } = await import("@/app/api/v1/submissions/route");

    const response = await POST(makeRequest({ ...VALID_BODY, assignmentId: "assign-expired" }));
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe("assignmentClosed");
  });

  it("does not call assignment context check for admin users", async () => {
    getApiUserMock.mockResolvedValue({
      id: "admin-1",
      role: "admin",
      username: "admin",
      email: "admin@example.com",
      name: "Admin",
      className: null,
      mustChangePassword: false,
    });
    const { POST } = await import("@/app/api/v1/submissions/route");

    const response = await POST(makeRequest(VALID_BODY));

    expect(response.status).toBe(201);
    expect(getStudentAssignmentContextsForProblemMock).not.toHaveBeenCalled();
  });

  it("does not fire audit event when post-insert findFirst returns null", async () => {
    queueSelectResults([
      [{ id: "problem-1", title: "Hello World" }],
      [{ id: "lc-1" }],
      [{ recentCount: 0, pendingCount: 0 }],
      [{ count: 0 }],
      [],
    ]);
    const { POST } = await import("@/app/api/v1/submissions/route");

    const response = await POST(makeRequest(VALID_BODY));
    expect(response.status).toBe(201);
    expect(recordAuditEventMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/v1/submissions", () => {
  beforeEach(async () => {
    vi.clearAllMocks();

    resolveCapabilitiesMock.mockImplementation(async (role: string) => {
      const { DEFAULT_ROLE_CAPABILITIES } = await import("@/lib/capabilities/defaults");
      const caps = DEFAULT_ROLE_CAPABILITIES[role as keyof typeof DEFAULT_ROLE_CAPABILITIES];
      return new Set(caps ?? []);
    });

    getApiUserMock.mockResolvedValue(VALID_USER);

    queueSelectResults([
      [{ count: 1 }],
    ]);
    dbMockObj.query.submissions.findMany = vi.fn().mockResolvedValue([
      {
        id: "submission-1",
        userId: "user-1",
        problemId: "problem-1",
        assignmentId: null,
        language: "python",
        status: "accepted",
        executionTimeMs: 10,
        memoryUsedKb: 100,
        score: 100,
        judgedAt: new Date(),
        submittedAt: new Date(),
      },
    ]);
  });

  it("filters to the current user when they lack submissions.view_all", async () => {
    const { GET } = await import("@/app/api/v1/submissions/route");
    const response = await GET(makeGetRequest());

    expect(response.status).toBe(200);
    const submissionWhere = (dbMockObj.query.submissions.findMany as any).mock.calls[0][0]?.where;
    expect(submissionWhere).toBeDefined();
  });

  it("does not apply the user filter for a custom role with submissions.view_all", async () => {
    getApiUserMock.mockResolvedValue({
      id: "reviewer-1",
      role: "custom_reviewer",
      username: "reviewer",
      email: "reviewer@example.com",
      name: "Reviewer",
      className: null,
      mustChangePassword: false,
    });
    resolveCapabilitiesMock.mockResolvedValue(new Set(["submissions.view_all"]));

    const { GET } = await import("@/app/api/v1/submissions/route");
    const response = await GET(makeGetRequest());

    expect(response.status).toBe(200);
    const submissionWhere = (dbMockObj.query.submissions.findMany as any).mock.calls[0][0]?.where;
    expect(submissionWhere).toBeUndefined();
  });
});
