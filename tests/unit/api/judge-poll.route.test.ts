import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  rawQueryOneMock,
  problemsFindFirstMock,
  dbSelectMock,
  recordAuditEventMock,
  consumeUserApiRateLimitMock,
  getDbNowUncachedMock,
  execTransactionMock,
  txUpdateMock,
  isJudgeAuthorizedMock,
  isJudgeAuthorizedForWorkerMock,
} =
  vi.hoisted(() => ({
    rawQueryOneMock: vi.fn(),
    problemsFindFirstMock: vi.fn(),
    dbSelectMock: vi.fn(),
    recordAuditEventMock: vi.fn(),
    consumeUserApiRateLimitMock: vi.fn(),
    getDbNowUncachedMock: vi.fn(),
    execTransactionMock: vi.fn(),
    txUpdateMock: vi.fn(),
    isJudgeAuthorizedMock: vi.fn(),
    isJudgeAuthorizedForWorkerMock: vi.fn(),
  }));

vi.mock("@/lib/judge/auth", () => ({
  isJudgeAuthorized: isJudgeAuthorizedMock,
  isJudgeAuthorizedForWorker: isJudgeAuthorizedForWorkerMock,
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
  execTransaction: execTransactionMock,
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

beforeEach(() => {
  vi.resetAllMocks();
  isJudgeAuthorizedMock.mockReturnValue(true);
  isJudgeAuthorizedForWorkerMock.mockResolvedValue({ authorized: true });

  rawQueryOneMock.mockResolvedValue({
    id: "submission-1",
    userId: "user-1",
    problemId: "problem-1",
    assignmentId: null,
    previousStatus: "pending",
    claimToken: "claim-token",
    language: "python",
    sourceCode: "print(1)",
    status: "queued",
    compileOutput: null,
    executionTimeMs: null,
    memoryUsedKb: null,
    score: null,
    judgedAt: null,
    submittedAt: Date.now(),
  });

  problemsFindFirstMock.mockResolvedValue({
    timeLimitMs: 1000,
    memoryLimitMb: 128,
    comparisonMode: "exact",
    floatAbsoluteError: null,
    floatRelativeError: null,
  });

  dbSelectMock.mockReturnValue(makeSelectChain([]));
  txUpdateMock.mockReturnValue({
    set: vi.fn(() => ({ where: vi.fn() })),
  });
  execTransactionMock.mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
    const txSelectChain = {
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => [
            {
              judgeClaimToken: rawQueryOneMock.mock.calls[0]?.[1]?.claimToken,
            },
          ]),
        })),
      })),
    };

    await fn({
      select: vi.fn(() => txSelectChain),
      update: txUpdateMock,
    });
  });
  consumeUserApiRateLimitMock.mockResolvedValue(null);
  getDbNowUncachedMock.mockResolvedValue(new Date());
});

describe("POST /api/v1/judge/claim", () => {

  it("uses the shared API rate limiter instead of a process-local map", async () => {
    consumeUserApiRateLimitMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "rateLimited" }), {
        status: 429,
        headers: { "Content-Type": "application/json" },
      })
    );

    const response = await POST(
      new NextRequest("http://localhost:3000/api/v1/judge/claim", {
        method: "POST",
        headers: {
          Authorization: "Bearer test-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ workerId: "worker-1", workerSecret: "worker-secret" }),
      })
    );

    expect(response.status).toBe(429);
    expect(consumeUserApiRateLimitMock).toHaveBeenCalledWith(
      expect.any(NextRequest),
      "worker-1",
      "judge:claim"
    );
    expect(rawQueryOneMock).not.toHaveBeenCalled();
  });
  it("binds a primitive timestamp when claiming submissions", async () => {
    dbSelectMock.mockReturnValueOnce(
      makeSelectChain([{ status: "online", secretTokenHash: "hashed:worker-secret" }])
    );
    const response = await POST(
      new NextRequest("http://localhost:3000/api/v1/judge/claim", {
        method: "POST",
        headers: {
          Authorization: "Bearer test-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ workerId: "worker-1", workerSecret: "worker-secret" }),
      })
    );

    expect(rawQueryOneMock).toHaveBeenCalledOnce();
    expect(rawQueryOneMock.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        claimToken: expect.any(String),
        claimCreatedAt: expect.any(Number),
      })
    );

    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data).toMatchObject({
      id: "submission-1",
      claimToken: "claim-token",
      timeLimitMs: 1000,
      memoryLimitMb: 128,
      testCases: [],
    });
  });

  it("normalizes stored shell-prefixed commands so the worker does not double-wrap them", async () => {
    dbSelectMock
      .mockReturnValueOnce(
        makeSelectChain([{ status: "online", secretTokenHash: "hashed:worker-secret" }])
      )
      .mockReturnValueOnce(makeSelectChain([]))
      .mockReturnValueOnce(
        makeSelectChain([
          {
            dockerImage: "judge-csharp:latest",
            compileCommand: "sh -c HOME=/tmp mcs -optimize+ -out:/workspace/solution.exe /workspace/solution.cs",
            runCommand: "sh -c HOME=/tmp mono /workspace/solution.exe",
          },
        ])
      );

    const response = await POST(
      new NextRequest("http://localhost:3000/api/v1/judge/claim", {
        method: "POST",
        headers: {
          Authorization: "Bearer test-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ workerId: "worker-1", workerSecret: "worker-secret" }),
      })
    );

    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data).toMatchObject({
      dockerImage: "judge-csharp:latest",
      compileCommand: [
        "sh",
        "-c",
        "HOME=/tmp mcs -optimize+ -out:/workspace/solution.exe /workspace/solution.cs",
      ],
      runCommand: ["sh", "-c", "HOME=/tmp mono /workspace/solution.exe"],
    });
  });

  it("gates worker claims behind an atomic capacity reservation", async () => {
    dbSelectMock
      .mockReturnValueOnce(
        makeSelectChain([
          {
            status: "online",
            secretTokenHash: "hashed:worker-secret",
          },
        ])
      )
      .mockReturnValueOnce(makeSelectChain([]))
      .mockReturnValueOnce(
        makeSelectChain([
          {
            dockerImage: "judge-python",
            compileCommand: null,
            runCommand: "python /workspace/solution.py",
          },
        ])
      );

    const response = await POST(
      new NextRequest("http://localhost:3000/api/v1/judge/claim", {
        method: "POST",
        headers: {
          Authorization: "Bearer test-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ workerId: "worker-1", workerSecret: "worker-secret" }),
      })
    );

    expect(response.status).toBe(200);
    expect(rawQueryOneMock).toHaveBeenCalledOnce();
    expect(rawQueryOneMock.mock.calls[0]?.[0]).toContain("WITH worker_slot AS");
    expect(rawQueryOneMock.mock.calls[0]?.[0]).toContain("active_tasks = active_tasks + 1");
    expect(rawQueryOneMock.mock.calls[0]?.[0]).toContain("FROM candidate");
    expect(rawQueryOneMock.mock.calls[0]?.[0]).toContain("WHERE s.id = candidate.id");
  });

  it("returns workerAtCapacity when the atomic worker reservation cannot be acquired", async () => {
    rawQueryOneMock.mockResolvedValueOnce(null);
    dbSelectMock
      .mockReturnValueOnce(
        makeSelectChain([
          {
            status: "online",
            secretTokenHash: "hashed:worker-secret",
          },
        ])
      )
      .mockReturnValueOnce(
        makeSelectChain([
          {
            status: "online",
            activeTasks: 2,
            concurrency: 2,
          },
        ])
      );

    const response = await POST(
      new NextRequest("http://localhost:3000/api/v1/judge/claim", {
        method: "POST",
        headers: {
          Authorization: "Bearer test-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ workerId: "worker-1", workerSecret: "worker-secret" }),
      })
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "workerAtCapacity" });
  });

  it("records the pre-claim status when reclaiming a stale submission", async () => {
    dbSelectMock.mockReturnValueOnce(
      makeSelectChain([{ status: "online", secretTokenHash: "hashed:worker-secret" }])
    );
    rawQueryOneMock.mockResolvedValueOnce({
      id: "submission-1",
      userId: "user-1",
      problemId: "problem-1",
      assignmentId: null,
      previousStatus: "judging",
      claimToken: "claim-token",
      language: "python",
      sourceCode: "print(1)",
      status: "queued",
      compileOutput: null,
      executionTimeMs: null,
      memoryUsedKb: null,
      score: null,
      judgedAt: null,
      submittedAt: Date.now(),
    });

    const response = await POST(
      new NextRequest("http://localhost:3000/api/v1/judge/claim", {
        method: "POST",
        headers: {
          Authorization: "Bearer test-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ workerId: "worker-1", workerSecret: "worker-secret" }),
      })
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(recordAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        details: expect.objectContaining({
          previousStatus: "judging",
          status: "queued",
        }),
      })
    );
    expect(payload.data).toMatchObject({
      id: "submission-1",
      claimToken: "claim-token",
    });
  });

  it("releases the claimed row when post-claim row validation fails", async () => {
    dbSelectMock.mockReturnValueOnce(
      makeSelectChain([{ status: "online", secretTokenHash: "hashed:worker-secret" }])
    );
    rawQueryOneMock.mockResolvedValueOnce({
      id: "submission-parse-bad",
      problemId: "problem-1",
      claimToken: "claim-token",
    });

    const response = await POST(
      new NextRequest("http://localhost:3000/api/v1/judge/claim", {
        method: "POST",
        headers: {
          Authorization: "Bearer test-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ workerId: "worker-1", workerSecret: "worker-secret" }),
      })
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({ error: "invalidJudgeClaim" });
    expect(execTransactionMock).toHaveBeenCalledOnce();
    expect(txUpdateMock).toHaveBeenCalled();
  });

  it("releases worker reservations when post-claim response assembly fails", async () => {
    dbSelectMock.mockReturnValueOnce(
      makeSelectChain([
        {
          status: "online",
          secretTokenHash: "hashed:worker-secret",
        },
      ])
    );
    problemsFindFirstMock.mockRejectedValueOnce(new Error("problem lookup failed"));

    const response = await POST(
      new NextRequest("http://localhost:3000/api/v1/judge/claim", {
        method: "POST",
        headers: {
          Authorization: "Bearer test-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ workerId: "worker-1", workerSecret: "worker-secret" }),
      })
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "internalServerError" });
    expect(execTransactionMock).toHaveBeenCalledOnce();
    expect(txUpdateMock).toHaveBeenCalledTimes(2);
  });

  it("rejects worker claims when the per-worker secret is missing", async () => {
    const response = await POST(
      new NextRequest("http://localhost:3000/api/v1/judge/claim", {
        method: "POST",
        headers: {
          Authorization: "Bearer test-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ workerId: "worker-1" }),
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "workerSecretRequired" });
  });

  it("rejects worker claims when the per-worker secret is invalid", async () => {
    dbSelectMock.mockReturnValueOnce(
      makeSelectChain([
        {
          status: "online",
          secretTokenHash: "hashed:worker-secret",
        },
      ])
    );

    const response = await POST(
      new NextRequest("http://localhost:3000/api/v1/judge/claim", {
        method: "POST",
        headers: {
          Authorization: "Bearer test-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ workerId: "worker-1", workerSecret: "wrong-secret" }),
      })
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "invalidWorkerSecret" });
  });

  it("accepts worker claims when the stored worker secret hash matches the provided secret", async () => {
    dbSelectMock
      .mockReturnValueOnce(
        makeSelectChain([
          {
            status: "online",
            secretTokenHash: "hashed:worker-secret",
          },
        ])
      )
      .mockReturnValueOnce(makeSelectChain([]))
      .mockReturnValueOnce(
        makeSelectChain([
          {
            dockerImage: "judge-python",
            compileCommand: null,
            runCommand: "python /workspace/solution.py",
          },
        ])
      );

    const response = await POST(
      new NextRequest("http://localhost:3000/api/v1/judge/claim", {
        method: "POST",
        headers: {
          Authorization: "Bearer test-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ workerId: "worker-1", workerSecret: "worker-secret" }),
      })
    );

    expect(response.status).toBe(200);
  });

  it("rejects a claim carrying only the shared token (no workerId) — C4-2 Part 1", async () => {
    // The shared JUDGE_AUTH_TOKEN is bootstrap-only (/register). A request with
    // no workerId must be rejected at the schema boundary so a leaked shared
    // token cannot claim a submission and exfiltrate sourceCode + hidden test
    // cases. isJudgeAuthorizedMock being true models a valid shared token.
    isJudgeAuthorizedMock.mockReturnValue(true);

    const response = await POST(
      new NextRequest("http://localhost:3000/api/v1/judge/claim", {
        method: "POST",
        headers: {
          Authorization: "Bearer shared-judge-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "workerIdRequired" });
    // The shared-token auth path must not have been consulted.
    expect(isJudgeAuthorizedMock).not.toHaveBeenCalled();
    expect(rawQueryOneMock).not.toHaveBeenCalled();
  });
});
