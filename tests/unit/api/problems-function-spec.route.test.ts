import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// Hoisted mocks — must be declared before any module imports
// ---------------------------------------------------------------------------
const {
  getApiUserMock,
  csrfForbiddenMock,
  consumeApiRateLimitMock,
  recordAuditEventMock,
  problemsFindFirstMock,
  testCasesFindManyMock,
  submissionsFindFirstMock,
  dbSelectMock,
  createProblemWithTestCasesMock,
  updateProblemWithTestCasesMock,
  loggerErrorMock,
  resolveCapabilitiesMock,
  canAccessProblemMock,
  canManageProblemMock,
} = vi.hoisted(() => ({
  getApiUserMock: vi.fn(),
  csrfForbiddenMock: vi.fn<() => NextResponse | null>(() => null),
  consumeApiRateLimitMock: vi.fn<() => NextResponse | null>(() => null),
  recordAuditEventMock: vi.fn(),
  problemsFindFirstMock: vi.fn(),
  testCasesFindManyMock: vi.fn(),
  submissionsFindFirstMock: vi.fn(),
  dbSelectMock: vi.fn(),
  createProblemWithTestCasesMock: vi.fn(),
  updateProblemWithTestCasesMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  resolveCapabilitiesMock: vi.fn(),
  canAccessProblemMock: vi.fn(),
  canManageProblemMock: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("@/lib/api/auth", () => ({
  getApiUser: getApiUserMock,
  csrfForbidden: csrfForbiddenMock,
  unauthorized: () => NextResponse.json({ error: "unauthorized" }, { status: 401 }),
  forbidden: () => NextResponse.json({ error: "forbidden" }, { status: 403 }),
}));

vi.mock("@/lib/api/responses", () => ({
  apiSuccess: (data: unknown, opts?: { status?: number; headers?: Record<string, string> }) =>
    NextResponse.json({ data }, { status: opts?.status ?? 200, headers: opts?.headers }),
  apiError: (error: string, status: number) =>
    NextResponse.json({ error }, { status }),
  apiPaginated: (data: unknown[], page: number, limit: number, total: number) =>
    NextResponse.json({ data, page, limit, total }),
}));

vi.mock("@/lib/audit/events", () => ({
  recordAuditEvent: recordAuditEventMock,
}));

vi.mock("@/lib/security/api-rate-limit", () => ({
  consumeApiRateLimit: consumeApiRateLimitMock,
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    error: loggerErrorMock,
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("@/lib/problem-management", () => ({
  createProblemWithTestCases: createProblemWithTestCasesMock,
  updateProblemWithTestCases: updateProblemWithTestCasesMock,
  mergeTestCasePatchIntoExisting: (existing: unknown[], patch: unknown[]) => patch,
}));

vi.mock("@/lib/api/pagination", () => ({
  parsePagination: () => ({ page: 1, limit: 20, offset: 0 }),
}));

vi.mock("@/lib/capabilities/cache", () => ({
  resolveCapabilities: resolveCapabilitiesMock,
}));

vi.mock("@/lib/auth/permissions", () => ({
  canAccessProblem: canAccessProblemMock,
  canManageProblem: canManageProblemMock,
}));

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      problems: { findFirst: problemsFindFirstMock },
      testCases: { findMany: testCasesFindManyMock },
      submissions: { findFirst: submissionsFindFirstMock },
    },
    select: dbSelectMock,
  },
  execTransaction: vi.fn(),
}));

// Import handlers AFTER all mocks are set up
import { POST } from "@/app/api/v1/problems/route";
import { GET, PATCH } from "@/app/api/v1/problems/[id]/route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ADMIN_USER = { id: "admin-1", role: "admin", username: "admin" };
const STUDENT_USER = { id: "student-1", role: "student", username: "student" };

const VALID_SPEC = {
  functionName: "twoSum",
  params: [
    { name: "nums", type: "int[]" },
    { name: "target", type: "int" },
  ],
  returnType: "int[]",
  enabledLanguages: ["python", "cpp23"],
};

function makePostRequest(body: unknown) {
  return new NextRequest("http://localhost:3000/api/v1/problems", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-csrf-token": "valid" },
    body: JSON.stringify(body),
  });
}

function makePatchRequest(id: string, body: unknown) {
  return new NextRequest(`http://localhost:3000/api/v1/problems/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "x-csrf-token": "valid" },
    body: JSON.stringify(body),
  });
}

function makeGetRequest(id: string) {
  return new NextRequest(`http://localhost:3000/api/v1/problems/${id}`, {
    method: "GET",
  });
}

function routeCtx(id: string) {
  return { params: Promise.resolve({ id }) };
}

const VALID_DESCRIPTION = [
  "### Problem",
  "Return the sum of two integers.",
  "",
  "### Input",
  "A single line contains two integers.",
  "",
  "### Output",
  "Print the sum of the two integers.",
  "",
  "### Constraints",
  "- -1000 <= A, B <= 1000",
  "",
  "### Examples",
  "**Input 1**",
  "```",
  "1 2",
  "```",
  "",
  "**Output 1**",
  "```",
  "3",
  "```",
  "",
  "Explanation: `1 + 2 = 3`.",
].join("\n");

const BASE_BODY = {
  title: "Two Sum",
  description: VALID_DESCRIPTION,
  timeLimitMs: 2000,
  memoryLimitMb: 256,
  visibility: "private",
  testCases: [{ input: "1\n", expectedOutput: "1\n", isVisible: false }],
};

beforeEach(() => {
  vi.clearAllMocks();
  csrfForbiddenMock.mockReturnValue(null);
  consumeApiRateLimitMock.mockReturnValue(null);
  getApiUserMock.mockResolvedValue(ADMIN_USER);
  createProblemWithTestCasesMock.mockResolvedValue("prob-1");
  updateProblemWithTestCasesMock.mockResolvedValue(undefined);
  resolveCapabilitiesMock.mockResolvedValue({ has: () => true });
  canAccessProblemMock.mockResolvedValue(true);
  canManageProblemMock.mockResolvedValue(true);
  testCasesFindManyMock.mockResolvedValue([]);
  submissionsFindFirstMock.mockResolvedValue(null);
  problemsFindFirstMock.mockResolvedValue({
    id: "prob-1",
    title: "Two Sum",
    problemType: "function",
    functionSpec: VALID_SPEC,
    visibility: "private",
    testCases: [],
  });
});

// ---------------------------------------------------------------------------
// POST — create
// ---------------------------------------------------------------------------

describe("POST /api/v1/problems — function spec", () => {
  it("persists functionSpec + referenceSolution for a function problem", async () => {
    const res = await POST(
      makePostRequest({
        ...BASE_BODY,
        problemType: "function",
        functionSpec: VALID_SPEC,
        referenceSolution: { language: "python", source: "def twoSum(): pass" },
      }), { params: Promise.resolve({}) }
    );
    expect(res.status).toBe(201);
    expect(createProblemWithTestCasesMock).toHaveBeenCalledOnce();
    const arg = createProblemWithTestCasesMock.mock.calls[0][0];
    expect(arg.problemType).toBe("function");
    expect(arg.functionSpec).toMatchObject({ functionName: "twoSum" });
    expect(arg.referenceSolution).toMatchObject({ language: "python" });
  });

  it("returns 400 for an invalid functionSpec (zero params)", async () => {
    const res = await POST(
      makePostRequest({
        ...BASE_BODY,
        problemType: "function",
        functionSpec: { ...VALID_SPEC, params: [] },
      }), { params: Promise.resolve({}) }
    );
    expect(res.status).toBe(400);
    expect(createProblemWithTestCasesMock).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid functionSpec (bad type)", async () => {
    const res = await POST(
      makePostRequest({
        ...BASE_BODY,
        problemType: "function",
        functionSpec: { ...VALID_SPEC, returnType: "bogus" },
      }), { params: Promise.resolve({}) }
    );
    expect(res.status).toBe(400);
    expect(createProblemWithTestCasesMock).not.toHaveBeenCalled();
  });

  it("returns 400 for a referenceSolution with an unsupported language", async () => {
    const res = await POST(
      makePostRequest({
        ...BASE_BODY,
        problemType: "function",
        functionSpec: VALID_SPEC,
        referenceSolution: { language: "rust", source: "fn twoSum() {}" },
      }), { params: Promise.resolve({}) }
    );
    expect(res.status).toBe(400);
    expect(createProblemWithTestCasesMock).not.toHaveBeenCalled();
  });

  it("accepts a referenceSolution with a supported function-judging language", async () => {
    const res = await POST(
      makePostRequest({
        ...BASE_BODY,
        problemType: "function",
        functionSpec: VALID_SPEC,
        referenceSolution: { language: "python", source: "def twoSum(): pass" },
      }), { params: Promise.resolve({}) }
    );
    expect(res.status).toBe(201);
    expect(createProblemWithTestCasesMock).toHaveBeenCalledOnce();
  });

  it("returns 400 when problemType is function but functionSpec missing", async () => {
    const res = await POST(
      makePostRequest({ ...BASE_BODY, problemType: "function" }), { params: Promise.resolve({}) }
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("functionSpecRequired");
    expect(createProblemWithTestCasesMock).not.toHaveBeenCalled();
  });

  it("does not forward functionSpec/referenceSolution for a non-function problem", async () => {
    const res = await POST(
      makePostRequest({
        ...BASE_BODY,
        problemType: "auto",
        functionSpec: VALID_SPEC,
        referenceSolution: { language: "python", source: "x" },
      }), { params: Promise.resolve({}) }
    );
    expect(res.status).toBe(201);
    const arg = createProblemWithTestCasesMock.mock.calls[0][0];
    expect(arg.functionSpec ?? null).toBeNull();
    expect(arg.referenceSolution ?? null).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// PATCH — update
// ---------------------------------------------------------------------------

describe("PATCH /api/v1/problems/[id] — function spec", () => {
  beforeEach(() => {
    // Tags-resolution query (body.tags === undefined): select().from().innerJoin().where() → []
    const whereFn = vi.fn().mockResolvedValue([]);
    const innerJoinFn = vi.fn(() => ({ where: whereFn }));
    const fromFn = vi.fn(() => ({ innerJoin: innerJoinFn }));
    dbSelectMock.mockReturnValue({ from: fromFn });
    problemsFindFirstMock.mockResolvedValue({
      id: "prob-1",
      title: "Two Sum",
      description: VALID_DESCRIPTION,
      problemType: "auto",
      visibility: "private",
      timeLimitMs: 2000,
      memoryLimitMb: 256,
      authorId: "admin-1",
      testCases: [],
    });
  });

  it("persists functionSpec when switching a problem to function type", async () => {
    const res = await PATCH(
      makePatchRequest("prob-1", {
        problemType: "function",
        functionSpec: VALID_SPEC,
        referenceSolution: { language: "python", source: "def twoSum(): pass" },
      }),
      routeCtx("prob-1")
    );
    expect(res.status).toBe(200);
    expect(updateProblemWithTestCasesMock).toHaveBeenCalledOnce();
    const arg = updateProblemWithTestCasesMock.mock.calls[0][1];
    expect(arg.problemType).toBe("function");
    expect(arg.functionSpec).toMatchObject({ functionName: "twoSum" });
    expect(arg.referenceSolution).toMatchObject({ language: "python" });
  });

  it("returns 400 when switching to function type without a spec", async () => {
    const res = await PATCH(
      makePatchRequest("prob-1", { problemType: "function" }),
      routeCtx("prob-1")
    );
    expect(res.status).toBe(400);
    expect(updateProblemWithTestCasesMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// GET — student-facing read must NOT expose referenceSolution
// ---------------------------------------------------------------------------

describe("GET /api/v1/problems/[id] — referenceSolution hiding", () => {
  it("strips referenceSolution from a non-manager (student) read", async () => {
    getApiUserMock.mockResolvedValue(STUDENT_USER);
    resolveCapabilitiesMock.mockResolvedValue({ has: () => false });
    canAccessProblemMock.mockResolvedValue(true);
    // Strict gate rejects the student (not author / not in teaching group).
    canManageProblemMock.mockResolvedValue(false);
    // findFirst is called twice: stub (columns) then full row.
    problemsFindFirstMock
      .mockResolvedValueOnce({ id: "prob-1", authorId: "author-9", visibility: "public" })
      .mockResolvedValueOnce({
        id: "prob-1",
        title: "Two Sum",
        problemType: "function",
        functionSpec: VALID_SPEC,
        referenceSolution: { language: "python", source: "SECRET" },
        visibility: "public",
      });

    const res = await GET(makeGetRequest("prob-1"), routeCtx("prob-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.referenceSolution).toBeUndefined();
    // functionSpec MUST remain (drives student stub + language list)
    expect(body.data.functionSpec).toMatchObject({ functionName: "twoSum" });
    // Non-managers must not receive hidden test cases either.
    expect(body.data.testCases).toBeUndefined();
    expect(testCasesFindManyMock).not.toHaveBeenCalled();
  });

  it("strips referenceSolution + hidden testCases from a problems.edit holder outside the teaching group", async () => {
    // The caller holds problems.edit but is neither the author nor in the
    // problem's teaching group, and lacks groups.view_all. The looser local
    // check (caps.has('problems.edit')) would leak the referenceSolution; the
    // strict canManageProblem gate must reject them.
    getApiUserMock.mockResolvedValue({ id: "instructor-x", role: "instructor", username: "ix" });
    resolveCapabilitiesMock.mockResolvedValue({ has: (c: string) => c === "problems.edit" });
    canAccessProblemMock.mockResolvedValue(true);
    canManageProblemMock.mockResolvedValue(false);
    problemsFindFirstMock
      .mockResolvedValueOnce({ id: "prob-1", authorId: "admin-1", visibility: "private" })
      .mockResolvedValueOnce({
        id: "prob-1",
        title: "Two Sum",
        problemType: "function",
        functionSpec: VALID_SPEC,
        referenceSolution: { language: "python", source: "SECRET" },
        visibility: "private",
      });

    const res = await GET(makeGetRequest("prob-1"), routeCtx("prob-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.referenceSolution).toBeUndefined();
    expect(body.data.testCases).toBeUndefined();
    expect(testCasesFindManyMock).not.toHaveBeenCalled();
  });

  it("retains referenceSolution for a manager (author) read", async () => {
    getApiUserMock.mockResolvedValue(ADMIN_USER);
    resolveCapabilitiesMock.mockResolvedValue({ has: (c: string) => c === "problems.edit" });
    canAccessProblemMock.mockResolvedValue(true);
    testCasesFindManyMock.mockResolvedValue([]);
    problemsFindFirstMock
      .mockResolvedValueOnce({ id: "prob-1", authorId: "admin-1", visibility: "private" })
      .mockResolvedValueOnce({
        id: "prob-1",
        title: "Two Sum",
        problemType: "function",
        functionSpec: VALID_SPEC,
        referenceSolution: { language: "python", source: "SECRET" },
        visibility: "private",
      });

    const res = await GET(makeGetRequest("prob-1"), routeCtx("prob-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.referenceSolution).toMatchObject({ language: "python" });
  });
});
