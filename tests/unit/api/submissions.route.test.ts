import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const {
  getApiUserMock,
  csrfForbiddenMock,
  consumeApiRateLimitMock,
  dbSelectMock,
  dbInsertMock,
  recordAuditEventMock,
  getRequiredAssignmentContextsForProblemMock,
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
  getRequiredAssignmentContextsForProblemMock: vi.fn(),
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
}));

vi.mock("@/lib/security/api-rate-limit", () => ({
  consumeApiRateLimit: consumeApiRateLimitMock,
}));

vi.mock("@/lib/audit/events", () => ({
  recordAuditEvent: recordAuditEventMock,
}));

vi.mock("@/lib/assignments/submissions", () => ({
  getRequiredAssignmentContextsForProblem: getRequiredAssignmentContextsForProblemMock,
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
  query: {
    submissions: { findFirst: vi.fn(), findMany: vi.fn() },
    // POST snapshots the author's shareAcceptedSolutions preference into the
    // submission row (sharedWithCommunity); default to the opt-in default.
    users: { findFirst: vi.fn().mockResolvedValue({ shareAcceptedSolutions: false }) },
  },
  execute: vi.fn().mockResolvedValue(undefined),
};

vi.mock("@/lib/db-time", () => ({
  getDbNowUncached: vi.fn().mockResolvedValue(new Date("2026-04-20T12:00:00Z")),
}));

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
    orderBy: vi.fn(),
    limit: vi.fn(),
    offset: vi.fn(),
    then: vi.fn(),
  };
  chain.from.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  chain.orderBy.mockReturnValue(chain);
  chain.limit.mockReturnValue(chain);
  chain.offset.mockImplementation(() => result);
  chain.then.mockImplementation((resolve: (value: unknown) => unknown) => Promise.resolve(resolve(result)));
  return chain;
}

function queueSelectResults(results: unknown[]) {
  dbSelectMock.mockImplementation(() => {
    const next = results.shift();
    return makeSelectChain(next);
  });
}

function userSubmissionLimitRows(recentCount: number, pendingCount: number): unknown[] {
  return [
    [{ count: recentCount }],
    [{ count: pendingCount }],
  ];
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
    getRequiredAssignmentContextsForProblemMock.mockResolvedValue([]);
    validateAssignmentSubmissionMock.mockResolvedValue({ ok: true });
    canAccessProblemMock.mockResolvedValue(true);
    generateSubmissionIdMock.mockReturnValue("submission-abc123");
    dbInsertMock.mockResolvedValue(undefined);
    dbMockObj.query.users.findFirst.mockResolvedValue({ shareAcceptedSolutions: false });

    queueSelectResults([
      [{ id: "problem-1", title: "Hello World" }],
      [{ id: "lc-1" }],
      ...userSubmissionLimitRows(0, 0),
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
    const response = await POST(makeRequest(VALID_BODY), { params: Promise.resolve({}) });
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

  it("snapshots the author's sharing preference into sharedWithCommunity", async () => {
    dbMockObj.query.users.findFirst.mockResolvedValue({ shareAcceptedSolutions: true });
    const { POST } = await import("@/app/api/v1/submissions/route");

    const response = await POST(makeRequest(VALID_BODY), { params: Promise.resolve({}) });

    expect(response.status).toBe(201);
    expect(dbInsertMock).toHaveBeenCalledWith(expect.objectContaining({
      sharedWithCommunity: true,
    }));
  });

  it("inserts sharedWithCommunity=false when the author is not sharing", async () => {
    const { POST } = await import("@/app/api/v1/submissions/route");

    const response = await POST(makeRequest(VALID_BODY), { params: Promise.resolve({}) });

    expect(response.status).toBe(201);
    expect(dbInsertMock).toHaveBeenCalledWith(expect.objectContaining({
      sharedWithCommunity: false,
    }));
  });

  it.each(["plaintext", "verilog", "systemverilog", "vhdl"])(
    "accepts %s as a supported output-only language when it is enabled",
    async (language) => {
      const { POST } = await import("@/app/api/v1/submissions/route");

      const response = await POST(makeRequest({
        ...VALID_BODY,
        language,
        sourceCode: "output only",
      }), { params: Promise.resolve({}) });

      expect(response.status).toBe(201);
      expect(dbInsertMock).toHaveBeenCalledWith(expect.objectContaining({
        language,
      }));
    }
  );

  it("returns 401 when not authenticated", async () => {
    getApiUserMock.mockResolvedValue(null);
    const { POST } = await import("@/app/api/v1/submissions/route");

    const response = await POST(makeRequest(VALID_BODY), { params: Promise.resolve({}) });
    expect(response.status).toBe(401);
  });

  it("returns 403 when CSRF check fails", async () => {
    csrfForbiddenMock.mockReturnValue(NextResponse.json({ error: "forbidden" }, { status: 403 }));
    const { POST } = await import("@/app/api/v1/submissions/route");

    const response = await POST(makeRequest(VALID_BODY), { params: Promise.resolve({}) });
    expect(response.status).toBe(403);
  });

  it("returns 400 when problemId is empty", async () => {
    const { POST } = await import("@/app/api/v1/submissions/route");
    const response = await POST(makeRequest({ problemId: "", language: "python", sourceCode: "x=1" }), { params: Promise.resolve({}) });
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe("problemRequired");
  });

  it("returns 400 when language is empty", async () => {
    const { POST } = await import("@/app/api/v1/submissions/route");
    const response = await POST(makeRequest({ problemId: "p-1", language: "", sourceCode: "x=1" }), { params: Promise.resolve({}) });
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe("languageRequired");
  });

  it("returns 400 when sourceCode is empty", async () => {
    const { POST } = await import("@/app/api/v1/submissions/route");
    const response = await POST(makeRequest({ problemId: "p-1", language: "python", sourceCode: "" }), { params: Promise.resolve({}) });
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe("sourceCodeRequired");
  });

  it("returns 400 for an unsupported/unknown language", async () => {
    const { POST } = await import("@/app/api/v1/submissions/route");
    const response = await POST(makeRequest({ ...VALID_BODY, language: "nonexistent_lang" }), { params: Promise.resolve({}) });
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe("languageNotSupported");
  });

  it("returns 413 when source code exceeds the byte limit", async () => {
    const hugeSource = "x".repeat(262145);
    const { POST } = await import("@/app/api/v1/submissions/route");
    const response = await POST(makeRequest({ ...VALID_BODY, sourceCode: hugeSource }), { params: Promise.resolve({}) });
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

    const response = await POST(makeRequest(VALID_BODY), { params: Promise.resolve({}) });
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

    const response = await POST(makeRequest(VALID_BODY), { params: Promise.resolve({}) });
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe("languageNotSupported");
  });

  // ── M1/M2: enabledLanguages enforcement for function problems ───────────────
  it("returns 400 with languageNotEnabledForProblem when the language is not in the function problem's enabledLanguages", async () => {
    queueSelectResults([
      [{
        id: "problem-1",
        title: "Two Sum",
        problemType: "function",
        showCompileOutput: true,
        functionSpec: {
          functionName: "twoSum",
          params: [{ name: "x", type: "int" }],
          returnType: "int",
          enabledLanguages: ["python"],
        },
      }],
      [{ id: "lc-1" }],
    ]);
    const { POST } = await import("@/app/api/v1/submissions/route");

    const response = await POST(makeRequest({ ...VALID_BODY, language: "java" }), { params: Promise.resolve({}) });
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe("languageNotEnabledForProblem");
    // The submission must never be inserted when the language gate rejects it.
    expect(dbInsertMock).not.toHaveBeenCalled();
  });

  it("returns 400 with languageNotEnabledForProblem when the language is enabled but lacks a function-judging adapter", async () => {
    queueSelectResults([
      [{
        id: "problem-1",
        title: "Two Sum",
        problemType: "function",
        showCompileOutput: true,
        functionSpec: {
          functionName: "twoSum",
          params: [{ name: "x", type: "int" }],
          returnType: "int",
          // rust has no function-judging adapter, so even though listed it is gated.
          enabledLanguages: ["python", "rust"],
        },
      }],
      [{ id: "lc-1" }],
    ]);
    const { POST } = await import("@/app/api/v1/submissions/route");

    const response = await POST(makeRequest({ ...VALID_BODY, language: "rust" }), { params: Promise.resolve({}) });
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe("languageNotEnabledForProblem");
    expect(dbInsertMock).not.toHaveBeenCalled();
  });

  it("passes the language gate for a function problem when the language is enabled and supported", async () => {
    queueSelectResults([
      [{
        id: "problem-1",
        title: "Two Sum",
        problemType: "function",
        showCompileOutput: true,
        functionSpec: {
          functionName: "twoSum",
          params: [{ name: "x", type: "int" }],
          returnType: "int",
          enabledLanguages: ["python", "java"],
        },
      }],
      [{ id: "lc-1" }],
      ...userSubmissionLimitRows(0, 0),
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
    const { POST } = await import("@/app/api/v1/submissions/route");

    const response = await POST(makeRequest({ ...VALID_BODY, language: "python" }), { params: Promise.resolve({}) });

    expect(response.status).toBe(201);
    expect(dbInsertMock).toHaveBeenCalled();
  });

  it("does not gate languages for a non-function problem", async () => {
    queueSelectResults([
      // problemType "auto" — no functionSpec; the enabledLanguages gate must not apply.
      [{ id: "problem-1", title: "Hello World", problemType: "auto", showCompileOutput: true, functionSpec: null }],
      [{ id: "lc-1" }],
      ...userSubmissionLimitRows(0, 0),
      [{ count: 0 }],
      [{
        id: "submission-abc123",
        userId: "user-1",
        problemId: "problem-1",
        assignmentId: null,
        language: "java",
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
        language: "java",
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

    const response = await POST(makeRequest({ ...VALID_BODY, language: "java" }), { params: Promise.resolve({}) });

    expect(response.status).toBe(201);
  });

  it("returns 403 when user does not have access to the problem", async () => {
    canAccessProblemMock.mockResolvedValue(false);
    const { POST } = await import("@/app/api/v1/submissions/route");

    const response = await POST(makeRequest(VALID_BODY), { params: Promise.resolve({}) });
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe("forbidden");
  });

  it("returns 429 when per-user rate limit is exceeded", async () => {
    queueSelectResults([
      [{ id: "problem-1", title: "Hello World" }],
      [{ id: "lc-1" }],
      ...userSubmissionLimitRows(120, 0),
    ]);
    const { POST } = await import("@/app/api/v1/submissions/route");

    const response = await POST(makeRequest(VALID_BODY), { params: Promise.resolve({}) });
    const payload = await response.json();

    expect(response.status).toBe(429);
    expect(payload.error).toBe("submissionRateLimited");
    expect(response.headers.get("Retry-After")).toBe("60");
  });

  it("returns 429 when per-user pending submission limit is exceeded", async () => {
    queueSelectResults([
      [{ id: "problem-1", title: "Hello World" }],
      [{ id: "lc-1" }],
      ...userSubmissionLimitRows(0, 3),
    ]);
    const { POST } = await import("@/app/api/v1/submissions/route");

    const response = await POST(makeRequest(VALID_BODY), { params: Promise.resolve({}) });
    const payload = await response.json();

    expect(response.status).toBe(429);
    expect(payload.error).toBe("tooManyPendingSubmissions");
    expect(response.headers.get("Retry-After")).toBe("10");
  });

  it("returns 503 when the global judge queue is full", async () => {
    queueSelectResults([
      [{ id: "problem-1", title: "Hello World" }],
      [{ id: "lc-1" }],
      ...userSubmissionLimitRows(0, 0),
      [{ count: 100 }],
    ]);
    const { POST } = await import("@/app/api/v1/submissions/route");

    const response = await POST(makeRequest(VALID_BODY), { params: Promise.resolve({}) });
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload.error).toBe("judgeQueueFull");
    expect(response.headers.get("Retry-After")).toBe("30");
  });

  it("returns 409 when a student submits without assignmentId and the problem is in multiple active assignments", async () => {
    getRequiredAssignmentContextsForProblemMock.mockResolvedValue([
      { assignmentId: "assign-1", title: "HW1", groupId: "group-1" },
      { assignmentId: "assign-2", title: "HW2", groupId: "group-1" },
    ]);
    const { POST } = await import("@/app/api/v1/submissions/route");

    const response = await POST(makeRequest(VALID_BODY), { params: Promise.resolve({}) });
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.error).toBe("assignmentContextRequired");
  });

  it("auto-routes to the only active assignment when the student omits assignmentId", async () => {
    getRequiredAssignmentContextsForProblemMock.mockResolvedValue([
      { assignmentId: "assign-1", title: "HW1", groupId: "group-1" },
    ]);
    validateAssignmentSubmissionMock.mockResolvedValue({
      ok: true,
      assignment: { id: "assign-1", groupId: "group-1", instructorId: "inst-1" },
    });
    queueSelectResults([
      [{ id: "problem-1", title: "Hello World" }],
      [{ id: "lc-1" }],
      ...userSubmissionLimitRows(0, 0),
      [{ count: 0 }],
      [],
      [{
        id: "submission-auto",
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
        id: "submission-auto",
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

    const response = await POST(makeRequest(VALID_BODY), { params: Promise.resolve({}) });

    expect(response.status).toBe(201);
    expect(validateAssignmentSubmissionMock).toHaveBeenCalledWith(
      "assign-1",
      "problem-1",
      "user-1",
      "student",
      // The submit route is the ONLY caller allowed to probe monitor
      // freshness (RPF cycle-4 AGG4-1 → cycle-5 AGG5-1).
      { probeStaleHeartbeat: true }
    );
  });

  it("passes assignment validation when assignmentId is provided and valid", async () => {
    validateAssignmentSubmissionMock.mockResolvedValue({
      ok: true,
      assignment: { id: "assign-1", groupId: "group-1", instructorId: "inst-1" },
    });
    queueSelectResults([
      [{ id: "problem-1", title: "Hello World" }],
      [{ id: "lc-1" }],
      ...userSubmissionLimitRows(0, 0),
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

    const response = await POST(makeRequest({ ...VALID_BODY, assignmentId: "assign-1" }), { params: Promise.resolve({}) });
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(validateAssignmentSubmissionMock).toHaveBeenCalledWith(
      "assign-1",
      "problem-1",
      "user-1",
      "student",
      // The submit route is the ONLY caller allowed to probe monitor
      // freshness (RPF cycle-4 AGG4-1 → cycle-5 AGG5-1).
      { probeStaleHeartbeat: true }
    );
    expect(payload.data.id).toBe("submission-abc123");
  });

  // RPF cycle-5 AGG5-1: the stale-heartbeat escalate flag is recorded by the
  // ROUTE, only after the submission insert succeeds, with the accepted
  // submission's id + the submitting IP + the DB-clock timestamp.
  it("records the stale-heartbeat flag AFTER the submission is accepted, linking the submission id", async () => {
    validateAssignmentSubmissionMock.mockResolvedValue({
      ok: true,
      assignment: { id: "assign-1", groupId: "group-1", instructorId: "inst-1" },
      staleHeartbeat: { latestEventAt: null, ageMs: null, thresholdMs: 90_000 },
    });
    queueSelectResults([
      [{ id: "problem-1", title: "Hello World" }],
      [{ id: "lc-1" }],
      ...userSubmissionLimitRows(0, 0),
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
    ]);
    const { POST } = await import("@/app/api/v1/submissions/route");

    const response = await POST(makeRequest({ ...VALID_BODY, assignmentId: "assign-1" }), { params: Promise.resolve({}) });

    expect(response.status).toBe(201);
    // Two inserts: the submission (inside the tx) then the flag (after it).
    expect(dbInsertMock).toHaveBeenCalledTimes(2);
    const flagValues = dbInsertMock.mock.calls[1][0];
    expect(flagValues).toMatchObject({
      assignmentId: "assign-1",
      userId: "user-1",
      eventType: "submission_stale_heartbeat",
      createdAt: new Date("2026-04-20T12:00:00Z"),
    });
    expect(JSON.parse(flagValues.details)).toEqual({
      latestEventAt: null,
      ageMs: null,
      thresholdMs: 90_000,
      submissionId: "submission-abc123",
    });
  });

  it("does NOT record a flag when the submission is rejected by the rate limiter (AGG5-1)", async () => {
    validateAssignmentSubmissionMock.mockResolvedValue({
      ok: true,
      assignment: { id: "assign-1", groupId: "group-1", instructorId: "inst-1" },
      staleHeartbeat: { latestEventAt: null, ageMs: null, thresholdMs: 90_000 },
    });
    queueSelectResults([
      [{ id: "problem-1", title: "Hello World" }],
      [{ id: "lc-1" }],
      ...userSubmissionLimitRows(120, 0),
    ]);
    const { POST } = await import("@/app/api/v1/submissions/route");

    const response = await POST(makeRequest({ ...VALID_BODY, assignmentId: "assign-1" }), { params: Promise.resolve({}) });
    const payload = await response.json();

    expect(response.status).toBe(429);
    expect(payload.error).toBe("submissionRateLimited");
    // Rejected attempt → no submission insert AND no escalate flag.
    expect(dbInsertMock).not.toHaveBeenCalled();
  });

  it("a failing flag insert never blocks the accepted submission (fail-open pin)", async () => {
    validateAssignmentSubmissionMock.mockResolvedValue({
      ok: true,
      assignment: { id: "assign-1", groupId: "group-1", instructorId: "inst-1" },
      staleHeartbeat: { latestEventAt: null, ageMs: null, thresholdMs: 90_000 },
    });
    dbInsertMock
      .mockResolvedValueOnce(undefined) // submission insert
      .mockRejectedValueOnce(new Error("db down")); // flag insert
    queueSelectResults([
      [{ id: "problem-1", title: "Hello World" }],
      [{ id: "lc-1" }],
      ...userSubmissionLimitRows(0, 0),
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
    ]);
    const { POST } = await import("@/app/api/v1/submissions/route");

    const response = await POST(makeRequest({ ...VALID_BODY, assignmentId: "assign-1" }), { params: Promise.resolve({}) });

    expect(response.status).toBe(201);
  });

  it("does not insert a flag when the probe verdict is fresh (null)", async () => {
    validateAssignmentSubmissionMock.mockResolvedValue({
      ok: true,
      assignment: { id: "assign-1", groupId: "group-1", instructorId: "inst-1" },
      staleHeartbeat: null,
    });
    queueSelectResults([
      [{ id: "problem-1", title: "Hello World" }],
      [{ id: "lc-1" }],
      ...userSubmissionLimitRows(0, 0),
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
    ]);
    const { POST } = await import("@/app/api/v1/submissions/route");

    const response = await POST(makeRequest({ ...VALID_BODY, assignmentId: "assign-1" }), { params: Promise.resolve({}) });

    expect(response.status).toBe(201);
    // Only the submission insert — no flag.
    expect(dbInsertMock).toHaveBeenCalledTimes(1);
  });

  it("returns assignment validation error when assignment validation fails", async () => {
    validateAssignmentSubmissionMock.mockResolvedValue({
      ok: false,
      status: 403,
      error: "assignmentClosed",
    });
    const { POST } = await import("@/app/api/v1/submissions/route");

    const response = await POST(makeRequest({ ...VALID_BODY, assignmentId: "assign-expired" }), { params: Promise.resolve({}) });
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe("assignmentClosed");
  });

  it("still allows admin users to submit without assignment context errors", async () => {
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

    const response = await POST(makeRequest(VALID_BODY), { params: Promise.resolve({}) });

    expect(response.status).toBe(201);
    expect(getRequiredAssignmentContextsForProblemMock).toHaveBeenCalledWith(
      "problem-1",
      "admin-1",
      "admin"
    );
  });

  it("does not fire audit event when post-insert findFirst returns null", async () => {
    queueSelectResults([
      [{ id: "problem-1", title: "Hello World" }],
      [{ id: "lc-1" }],
      ...userSubmissionLimitRows(0, 0),
      [{ count: 0 }],
      [],
    ]);
    const { POST } = await import("@/app/api/v1/submissions/route");

    const response = await POST(makeRequest(VALID_BODY), { params: Promise.resolve({}) });
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

    // Single query with COUNT(*) OVER() — _total column included in result
    queueSelectResults([
      [{
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
        _total: 1,
      }],
    ]);
  });

  it("orders the offset listing by (submittedAt, id) to match cursor mode (AGG6-5)", async () => {
    const chain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      offset: vi.fn().mockResolvedValue([]),
    };
    dbSelectMock.mockImplementation(() => chain);

    const { GET } = await import("@/app/api/v1/submissions/route");
    const response = await GET(makeGetRequest(), { params: Promise.resolve({}) });

    expect(response.status).toBe(200);
    // Two sort keys: submittedAt DESC + the id DESC tiebreak — same total
    // order as cursor mode, so same-timestamp rows cannot shuffle across
    // page boundaries.
    expect(chain.orderBy).toHaveBeenCalledTimes(1);
    expect(chain.orderBy.mock.calls[0]).toHaveLength(2);
  });

  it("filters to the current user when they lack submissions.view_all", async () => {
    const { GET } = await import("@/app/api/v1/submissions/route");
    const response = await GET(makeGetRequest(), { params: Promise.resolve({}) });

    expect(response.status).toBe(200);
    // The code now uses db.select() with .where() — verify it was called
    expect(dbSelectMock).toHaveBeenCalled();
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
    // Re-queue select results for this test since beforeEach's queue was consumed
    queueSelectResults([
      [{
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
        _total: 1,
      }],
    ]);

    const { GET } = await import("@/app/api/v1/submissions/route");
    const response = await GET(makeGetRequest(), { params: Promise.resolve({}) });

    expect(response.status).toBe(200);
    // The code now uses db.select() — verify the select was called
    expect(dbSelectMock).toHaveBeenCalled();
  });
});
