import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { rawQueryOneMock, problemsFindFirstMock, dbSelectMock, recordAuditEventMock } =
  vi.hoisted(() => ({
    rawQueryOneMock: vi.fn(),
    problemsFindFirstMock: vi.fn(),
    dbSelectMock: vi.fn(),
    recordAuditEventMock: vi.fn(),
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

vi.mock("@/lib/system-settings-config", () => ({
  getConfiguredSettings: () => ({ staleClaimTimeoutMs: 300_000 }),
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

beforeEach(() => {
  vi.clearAllMocks();

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
});

describe("POST /api/v1/judge/claim", () => {
  it("binds a primitive timestamp when claiming submissions", async () => {
    const response = await POST(
      new NextRequest("http://localhost:3000/api/v1/judge/claim", {
        method: "POST",
        headers: {
          Authorization: "Bearer test-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
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
        body: JSON.stringify({}),
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
        body: JSON.stringify({}),
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
          secretTokenHash: "hashed:expected-secret",
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
            secretToken: null,
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
});
