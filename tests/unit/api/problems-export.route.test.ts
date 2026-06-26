import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// Hoisted mocks — must be declared before any module imports
// ---------------------------------------------------------------------------
const {
  getApiUserMock,
  csrfForbiddenMock,
  consumeApiRateLimitMock,
  problemsFindFirstMock,
  dbSelectMock,
  canManageProblemMock,
  loggerErrorMock,
} = vi.hoisted(() => ({
  getApiUserMock: vi.fn(),
  csrfForbiddenMock: vi.fn<() => NextResponse | null>(() => null),
  consumeApiRateLimitMock: vi.fn<() => NextResponse | null>(() => null),
  problemsFindFirstMock: vi.fn(),
  dbSelectMock: vi.fn(),
  canManageProblemMock: vi.fn(),
  loggerErrorMock: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("@/lib/api/auth", () => ({
  getApiUser: getApiUserMock,
  csrfForbidden: csrfForbiddenMock,
  unauthorized: () => NextResponse.json({ error: "unauthorized" }, { status: 401 }),
  forbidden: () => NextResponse.json({ error: "forbidden" }, { status: 403 }),
  notFound: () => NextResponse.json({ error: "notFound" }, { status: 404 }),
}));

vi.mock("@/lib/api/responses", () => ({
  apiSuccess: (data: unknown, opts?: { status?: number; headers?: Record<string, string> }) =>
    NextResponse.json({ data }, { status: opts?.status ?? 200, headers: opts?.headers }),
  apiError: (error: string, status: number) =>
    NextResponse.json({ error }, { status }),
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

vi.mock("@/lib/auth/permissions", () => ({
  canManageProblem: canManageProblemMock,
}));

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      problems: { findFirst: problemsFindFirstMock },
    },
    select: dbSelectMock,
  },
}));

// Import handlers AFTER all mocks are set up
import { GET } from "@/app/api/v1/problems/[id]/export/route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeGetRequest(id: string) {
  return new NextRequest(`http://localhost:3000/api/v1/problems/${id}/export`, {
    method: "GET",
  });
}

const PROBLEM_ID = "prob-1";

const FUNCTION_PROBLEM_ROW = {
  title: "Two Sum",
  description: "### Problem\nReturn the sum.",
  sequenceNumber: 1,
  timeLimitMs: 2000,
  memoryLimitMb: 256,
  problemType: "function",
  functionSpec: {
    functionName: "twoSum",
    params: [{ name: "x", type: "int" }],
    returnType: "int",
    enabledLanguages: ["python"],
  },
  referenceSolution: { language: "python", source: "def twoSum(x): return x" },
  visibility: "private",
  showCompileOutput: true,
  showDetailedResults: true,
  showRuntimeErrors: true,
  allowAiAssistant: true,
  comparisonMode: "exact",
  floatAbsoluteError: null,
  floatRelativeError: null,
  difficulty: 5,
  defaultLanguage: "python",
};

const TEST_CASES = [
  { input: "1\n", expectedOutput: "1\n", isVisible: false, sortOrder: 0 },
];

/**
 * Wire the two db.select() chains the route issues:
 *   1. select().from(testCases).where().orderBy()  -> TEST_CASES
 *   2. select().from(problemTags).innerJoin().where() -> TAG_ROWS
 */
function mockSelectChains(cases: unknown[], tagRows: unknown[]) {
  const orderByFn = vi.fn().mockResolvedValue(cases);
  const whereCasesFn = vi.fn(() => ({ orderBy: orderByFn }));
  const fromCasesFn = vi.fn(() => ({ where: whereCasesFn }));

  const whereTagsFn = vi.fn().mockResolvedValue(tagRows);
  const innerJoinFn = vi.fn(() => ({ where: whereTagsFn }));
  const fromTagsFn = vi.fn(() => ({ innerJoin: innerJoinFn }));

  dbSelectMock
    .mockReturnValueOnce({ from: fromCasesFn })
    .mockReturnValueOnce({ from: fromTagsFn });
}

const ADMIN_USER = { id: "admin-1", role: "admin", username: "admin" };
const STUDENT_USER = { id: "student-1", role: "student", username: "student" };

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  csrfForbiddenMock.mockReturnValue(null);
  consumeApiRateLimitMock.mockReturnValue(null);
  getApiUserMock.mockResolvedValue(ADMIN_USER);
  canManageProblemMock.mockResolvedValue(true);
  problemsFindFirstMock.mockResolvedValue(FUNCTION_PROBLEM_ROW);
  mockSelectChains(TEST_CASES, [{ name: "easy" }]);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/v1/problems/[id]/export", () => {
  it("includes function-judging fields in the export payload", async () => {
    const res = await GET(makeGetRequest(PROBLEM_ID), {
      params: Promise.resolve({ id: PROBLEM_ID }),
    } as never);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.problem).toMatchObject({
      problemType: "function",
      functionSpec: FUNCTION_PROBLEM_ROW.functionSpec,
      referenceSolution: FUNCTION_PROBLEM_ROW.referenceSolution,
      defaultLanguage: "python",
    });
  });

  it("denies students via the canManageProblem gate (403)", async () => {
    getApiUserMock.mockResolvedValue(STUDENT_USER);
    canManageProblemMock.mockResolvedValue(false);

    const res = await GET(makeGetRequest(PROBLEM_ID), {
      params: Promise.resolve({ id: PROBLEM_ID }),
    } as never);

    expect(res.status).toBe(403);
    // db.select chains for cases/tags must not run once the gate denies.
    expect(dbSelectMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the problem does not exist", async () => {
    problemsFindFirstMock.mockResolvedValue(null);

    const res = await GET(makeGetRequest("missing"), {
      params: Promise.resolve({ id: "missing" }),
    } as never);

    expect(res.status).toBe(404);
  });
});
