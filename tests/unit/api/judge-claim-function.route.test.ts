import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * Regression-critical: the judge-claim hot path must wrap function-type
 * submissions into an assembled stdin/stdout harness for the worker, while
 * passing every other problem type (auto/manual/missing-spec/unsupported-lang)
 * through byte-for-byte unchanged. The PERSISTED submission source is never
 * mutated — only the source SENT to the worker is wrapped.
 */

const {
  rawQueryOneMock,
  problemsFindFirstMock,
  dbSelectMock,
  recordAuditEventMock,
  consumeUserApiRateLimitMock,
  getDbNowUncachedMock,
} = vi.hoisted(() => ({
  rawQueryOneMock: vi.fn(),
  problemsFindFirstMock: vi.fn(),
  dbSelectMock: vi.fn(),
  recordAuditEventMock: vi.fn(),
  consumeUserApiRateLimitMock: vi.fn(),
  getDbNowUncachedMock: vi.fn(),
}));

vi.mock("@/lib/judge/auth", () => ({
  isJudgeAuthorized: vi.fn(() => true),
  isJudgeAuthorizedForWorker: vi.fn(async () => ({ authorized: true })),
  hashToken: (value: string) => `hashed:${value}`,
}));

vi.mock("@/lib/audit/events", () => ({
  recordAuditEvent: recordAuditEventMock,
}));

vi.mock("@/lib/db/queries", () => ({
  rawQueryOne: rawQueryOneMock,
}));

vi.mock("@/lib/db-time", () => ({
  getDbNowUncached: getDbNowUncachedMock,
}));

vi.mock("@/lib/system-settings-config", () => ({
  getConfiguredSettings: () => ({ staleClaimTimeoutMs: 300_000 }),
}));

vi.mock("@/lib/security/api-rate-limit", () => ({
  consumeUserApiRateLimit: consumeUserApiRateLimitMock,
}));

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      problems: {
        findFirst: problemsFindFirstMock,
      },
    },
    select: dbSelectMock,
  },
}));

import { POST } from "@/app/api/v1/judge/claim/route";

function makeSelectChain(rows: unknown[]) {
  const chain = {
    from: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
  };
  chain.from.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  chain.orderBy.mockReturnValue(rows);
  chain.limit.mockReturnValue(rows);
  return chain;
}

const PYTHON_STUDENT_SOURCE =
  "class Solution:\n    def twoSum(self, nums, target):\n        return [0, 1]\n";

function claimedRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "submission-1",
    userId: "user-1",
    problemId: "problem-1",
    assignmentId: null,
    previousStatus: "pending",
    claimToken: "claim-token",
    language: "python",
    sourceCode: PYTHON_STUDENT_SOURCE,
    status: "queued",
    compileOutput: null,
    executionTimeMs: null,
    memoryUsedKb: null,
    score: null,
    judgedAt: null,
    submittedAt: Date.now(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  rawQueryOneMock.mockResolvedValue(claimedRow());
  problemsFindFirstMock.mockResolvedValue({
    timeLimitMs: 1000,
    memoryLimitMb: 128,
    comparisonMode: "exact",
    floatAbsoluteError: null,
    floatRelativeError: null,
    problemType: "auto",
    functionSpec: null,
  });
  // First select (worker-exists check) yields a valid online worker; later
  // selects (test cases / docker image) fall back to empty. workerId is
  // required on /claim as of C4-2 Part 1.
  dbSelectMock
    .mockReturnValueOnce(makeSelectChain([{ status: "online", secretTokenHash: "hashed:secret" }]))
    .mockReturnValue(makeSelectChain([]));
  consumeUserApiRateLimitMock.mockResolvedValue(null);
  getDbNowUncachedMock.mockResolvedValue(new Date());
});

async function claim() {
  return POST(
    new NextRequest("http://localhost:3000/api/v1/judge/claim", {
      method: "POST",
      headers: {
        Authorization: "Bearer test-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ workerId: "worker-1", workerSecret: "secret" }),
    }),
  );
}

describe("POST /api/v1/judge/claim — function-judging assembly", () => {
  it("selects problemType + functionSpec from the problem", async () => {
    await claim();
    expect(problemsFindFirstMock).toHaveBeenCalledOnce();
    const arg = problemsFindFirstMock.mock.calls[0]?.[0] as { columns?: Record<string, boolean> };
    expect(arg.columns).toMatchObject({ problemType: true, functionSpec: true });
  });

  it("wraps a function-type python submission into the assembled harness", async () => {
    problemsFindFirstMock.mockResolvedValue({
      timeLimitMs: 1000,
      memoryLimitMb: 128,
      comparisonMode: "exact",
      floatAbsoluteError: null,
      floatRelativeError: null,
      problemType: "function",
      functionSpec: {
        functionName: "twoSum",
        params: [
          { name: "nums", type: "int[]" },
          { name: "target", type: "int" },
        ],
        returnType: "int[]",
        enabledLanguages: ["python"],
      },
    });

    const response = await claim();
    const payload = await response.json();

    expect(response.status).toBe(200);
    // Assembly happened: the worker source contains the generated main that
    // invokes the student's Solution class.
    expect(payload.data.sourceCode).toContain("Solution().twoSum(*args)");
    expect(payload.data.sourceCode).toContain("import sys, json");
    // The student's original source is still embedded inside the harness.
    expect(payload.data.sourceCode).toContain(PYTHON_STUDENT_SOURCE);
    // But the outgoing source is NOT the bare student source — it was wrapped.
    expect(payload.data.sourceCode).not.toBe(PYTHON_STUDENT_SOURCE);
  });

  it("passes an auto-type submission's source through byte-identical", async () => {
    const response = await claim();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data.sourceCode).toBe(PYTHON_STUDENT_SOURCE);
  });

  it("passes a manual-type submission's source through unchanged", async () => {
    problemsFindFirstMock.mockResolvedValue({
      timeLimitMs: 1000,
      memoryLimitMb: 128,
      comparisonMode: "exact",
      floatAbsoluteError: null,
      floatRelativeError: null,
      problemType: "manual",
      functionSpec: null,
    });

    const response = await claim();
    const payload = await response.json();
    expect(payload.data.sourceCode).toBe(PYTHON_STUDENT_SOURCE);
  });

  it("passes through unchanged when problemType is function but the spec is missing", async () => {
    problemsFindFirstMock.mockResolvedValue({
      timeLimitMs: 1000,
      memoryLimitMb: 128,
      comparisonMode: "exact",
      floatAbsoluteError: null,
      floatRelativeError: null,
      problemType: "function",
      functionSpec: null,
    });

    const response = await claim();
    const payload = await response.json();
    expect(payload.data.sourceCode).toBe(PYTHON_STUDENT_SOURCE);
  });

  it("passes through unchanged for a function problem in an unsupported language", async () => {
    rawQueryOneMock.mockResolvedValue(
      claimedRow({ language: "brainfuck", sourceCode: "++++." }),
    );
    problemsFindFirstMock.mockResolvedValue({
      timeLimitMs: 1000,
      memoryLimitMb: 128,
      comparisonMode: "exact",
      floatAbsoluteError: null,
      floatRelativeError: null,
      problemType: "function",
      functionSpec: {
        functionName: "twoSum",
        params: [{ name: "nums", type: "int[]" }],
        returnType: "int[]",
        enabledLanguages: ["python"],
      },
    });

    const response = await claim();
    const payload = await response.json();
    expect(payload.data.sourceCode).toBe("++++.");
  });
});
