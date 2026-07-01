import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------
const {
  getApiUserMock,
  csrfForbiddenMock,
  consumeApiRateLimitMock,
  problemsFindFirstMock,
  testCasesFindManyMock,
  dbSelectMock,
  executeCompilerRunMock,
  resolveCapabilitiesMock,
  canManageProblemMock,
  loggerMock,
  isJudgeLanguageMock,
  getJudgeLanguageDefinitionMock,
} = vi.hoisted(() => ({
  getApiUserMock: vi.fn(),
  csrfForbiddenMock: vi.fn<() => NextResponse | null>(() => null),
  consumeApiRateLimitMock: vi.fn<() => NextResponse | null>(() => null),
  problemsFindFirstMock: vi.fn(),
  testCasesFindManyMock: vi.fn(),
  dbSelectMock: vi.fn(),
  executeCompilerRunMock: vi.fn(),
  resolveCapabilitiesMock: vi.fn(),
  canManageProblemMock: vi.fn(),
  loggerMock: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
  isJudgeLanguageMock: vi.fn(),
  getJudgeLanguageDefinitionMock: vi.fn(),
}));

vi.mock("@/lib/api/auth", () => ({
  getApiUser: getApiUserMock,
  csrfForbidden: csrfForbiddenMock,
  unauthorized: () => NextResponse.json({ error: "unauthorized" }, { status: 401 }),
  forbidden: () => NextResponse.json({ error: "forbidden" }, { status: 403 }),
  notFound: (resource: string) => NextResponse.json({ error: `${resource} not found` }, { status: 404 }),
}));

vi.mock("@/lib/api/responses", () => ({
  apiSuccess: (data: unknown, opts?: { status?: number }) =>
    NextResponse.json({ data }, { status: opts?.status ?? 200 }),
  apiError: (error: string, status: number) =>
    NextResponse.json({ error }, { status }),
}));

vi.mock("@/lib/security/api-rate-limit", () => ({
  consumeApiRateLimit: consumeApiRateLimitMock,
}));

vi.mock("@/lib/logger", () => ({ logger: loggerMock }));

vi.mock("@/lib/capabilities/cache", () => ({
  resolveCapabilities: resolveCapabilitiesMock,
}));

vi.mock("@/lib/auth/permissions", () => ({
  canManageProblem: canManageProblemMock,
}));

vi.mock("@/lib/compiler/execute", () => ({
  executeCompilerRun: executeCompilerRunMock,
}));

vi.mock("@/lib/judge/languages", () => ({
  isJudgeLanguage: isJudgeLanguageMock,
  getJudgeLanguageDefinition: getJudgeLanguageDefinitionMock,
  serializeJudgeCommand: (cmd: string[] | null | undefined) =>
    cmd && cmd.length ? cmd.join(" ") : null,
}));

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      problems: { findFirst: problemsFindFirstMock },
      testCases: { findMany: testCasesFindManyMock },
    },
    select: dbSelectMock,
  },
}));

import { POST } from "@/app/api/v1/problems/[id]/compute-expected/route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const AUTHOR_USER = { id: "author-1", role: "instructor", username: "author" };

const SPEC = {
  functionName: "add",
  params: [
    { name: "a", type: "int" },
    { name: "b", type: "int" },
  ],
  returnType: "int",
  enabledLanguages: ["python"],
};

function makeRequest(id: string) {
  return new NextRequest(`http://localhost:3000/api/v1/problems/${id}/compute-expected`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-csrf-token": "valid" },
    body: JSON.stringify({}),
  });
}

function routeCtx(id: string) {
  return { params: Promise.resolve({ id }) };
}

function wireLanguageConfig() {
  // db.select().from().where().limit() → [langConfig]
  const limitFn = vi.fn().mockResolvedValue([
    {
      extension: ".py",
      dockerImage: "judge-python:latest",
      compileCommand: null,
      runCommand: "python3 solution.py",
      isEnabled: true,
    },
  ]);
  const whereFn = vi.fn(() => ({ limit: limitFn }));
  const fromFn = vi.fn(() => ({ where: whereFn }));
  dbSelectMock.mockReturnValue({ from: fromFn });
}

beforeEach(() => {
  vi.clearAllMocks();
  csrfForbiddenMock.mockReturnValue(null);
  consumeApiRateLimitMock.mockReturnValue(null);
  getApiUserMock.mockResolvedValue(AUTHOR_USER);
  resolveCapabilitiesMock.mockResolvedValue({ has: () => true });
  canManageProblemMock.mockResolvedValue(true);
  isJudgeLanguageMock.mockReturnValue(true);
  getJudgeLanguageDefinitionMock.mockReturnValue({
    extension: ".py",
    dockerImage: "judge-python:latest",
    compileCommand: null,
    runCommand: ["python3", "solution.py"],
  });
  wireLanguageConfig();
  testCasesFindManyMock.mockResolvedValue([
    { input: "2\n3\n", expectedOutput: "", isVisible: true, sortOrder: 0 },
    { input: "10\n20\n", expectedOutput: "", isVisible: false, sortOrder: 1 },
  ]);
  problemsFindFirstMock.mockResolvedValue({
    id: "prob-1",
    authorId: "author-1",
    problemType: "function",
    functionSpec: SPEC,
    referenceSolution: { language: "python", source: "def add(a,b):\n  return a+b" },
  });
  executeCompilerRunMock
    .mockResolvedValueOnce({ stdout: "5\n", stderr: "", exitCode: 0, executionTimeMs: 1, timedOut: false, oomKilled: false, compileOutput: null })
    .mockResolvedValueOnce({ stdout: "30\n", stderr: "", exitCode: 0, executionTimeMs: 1, timedOut: false, oomKilled: false, compileOutput: null });
});

describe("POST /api/v1/problems/[id]/compute-expected", () => {
  it("computes expected output per test case from the reference solution", async () => {
    const res = await POST(makeRequest("prob-1"), routeCtx("prob-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.results).toHaveLength(2);
    expect(body.data.results[0]).toMatchObject({ testCaseIndex: 0, expectedOutput: "5\n", ok: true });
    expect(body.data.results[1]).toMatchObject({ testCaseIndex: 1, expectedOutput: "30\n", ok: true });
    expect(executeCompilerRunMock).toHaveBeenCalledTimes(2);
    // The assembled reference source (not the raw student stub) is executed.
    const firstCall = executeCompilerRunMock.mock.calls[0][0];
    expect(firstCall.stdin).toBe("2\n3\n");
    expect(typeof firstCall.sourceCode).toBe("string");
    expect(firstCall.sourceCode).toContain("add");
  });

  it("reports per-case failure without throwing the whole request", async () => {
    executeCompilerRunMock.mockReset();
    executeCompilerRunMock
      .mockResolvedValueOnce({ stdout: "5\n", stderr: "", exitCode: 0, executionTimeMs: 1, timedOut: false, oomKilled: false, compileOutput: null })
      .mockResolvedValueOnce({ stdout: "", stderr: "boom", exitCode: 1, executionTimeMs: 1, timedOut: false, oomKilled: false, compileOutput: "compile failed" });

    const res = await POST(makeRequest("prob-1"), routeCtx("prob-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.results[0].ok).toBe(true);
    expect(body.data.results[1].ok).toBe(false);
    expect(body.data.results[1].expectedOutput).toBe("");
    expect(body.data.results[1].error).toBeTruthy();
  });

  it("returns 404 when the problem does not exist", async () => {
    problemsFindFirstMock.mockResolvedValue(null);
    const res = await POST(makeRequest("missing"), routeCtx("missing"));
    expect(res.status).toBe(404);
    expect(executeCompilerRunMock).not.toHaveBeenCalled();
  });

  it("returns 403 when the user cannot manage the problem", async () => {
    canManageProblemMock.mockResolvedValue(false);
    resolveCapabilitiesMock.mockResolvedValue({ has: () => false });
    problemsFindFirstMock.mockResolvedValue({
      id: "prob-1",
      authorId: "someone-else",
      problemType: "function",
      functionSpec: SPEC,
      referenceSolution: { language: "python", source: "x" },
    });
    const res = await POST(makeRequest("prob-1"), routeCtx("prob-1"));
    expect(res.status).toBe(403);
    expect(executeCompilerRunMock).not.toHaveBeenCalled();
  });

  it("returns 400 when the problem is not a function problem", async () => {
    problemsFindFirstMock.mockResolvedValue({
      id: "prob-1",
      authorId: "author-1",
      problemType: "auto",
      functionSpec: null,
      referenceSolution: null,
    });
    const res = await POST(makeRequest("prob-1"), routeCtx("prob-1"));
    expect(res.status).toBe(400);
    expect(executeCompilerRunMock).not.toHaveBeenCalled();
  });

  it("returns 400 when there is no reference solution", async () => {
    problemsFindFirstMock.mockResolvedValue({
      id: "prob-1",
      authorId: "author-1",
      problemType: "function",
      functionSpec: SPEC,
      referenceSolution: null,
    });
    const res = await POST(makeRequest("prob-1"), routeCtx("prob-1"));
    expect(res.status).toBe(400);
    expect(executeCompilerRunMock).not.toHaveBeenCalled();
  });

  it("returns 400 when the reference solution language is unsupported", async () => {
    problemsFindFirstMock.mockResolvedValue({
      id: "prob-1",
      authorId: "author-1",
      problemType: "function",
      functionSpec: SPEC,
      referenceSolution: { language: "rust", source: "fn add() {}" },
    });
    const res = await POST(makeRequest("prob-1"), routeCtx("prob-1"));
    expect(res.status).toBe(400);
    expect(executeCompilerRunMock).not.toHaveBeenCalled();
  });
});
