import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  isJudgeAuthorizedMock,
  isJudgeAuthorizedForWorkerMock,
  submissionsFindFirstMock,
  execTransactionMock,
  dbTransactionMock,
  buildSubmissionResultRowsMock,
  computeFinalJudgeMetricsMock,
  extractFinalJudgeDetailMock,
} = vi.hoisted(() => ({
  isJudgeAuthorizedMock: vi.fn(),
  isJudgeAuthorizedForWorkerMock: vi.fn(),
  submissionsFindFirstMock: vi.fn(),
  execTransactionMock: vi.fn(),
  dbTransactionMock: vi.fn(),
  buildSubmissionResultRowsMock: vi.fn(),
  computeFinalJudgeMetricsMock: vi.fn(),
  extractFinalJudgeDetailMock: vi.fn(),
}));

vi.mock("@/lib/judge/auth", () => ({
  isJudgeAuthorized: isJudgeAuthorizedMock,
  isJudgeAuthorizedForWorker: isJudgeAuthorizedForWorkerMock,
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    error: vi.fn(),
  },
}));

vi.mock("@/lib/audit/events", () => ({
  recordAuditEvent: vi.fn(),
}));

vi.mock("@/lib/judge/auto-review", () => ({
  triggerAutoCodeReview: vi.fn(),
}));

vi.mock("@/lib/judge/verdict", () => ({
  IN_PROGRESS_JUDGE_STATUSES: new Set(["queued", "judging"]),
  buildSubmissionResultRows: buildSubmissionResultRowsMock,
  computeFinalJudgeMetrics: computeFinalJudgeMetricsMock,
  extractFinalJudgeDetail: extractFinalJudgeDetailMock,
}));

vi.mock("@/lib/security/constants", () => ({
  isSubmissionStatus: (value: string) =>
    [
      "pending",
      "queued",
      "judging",
      "accepted",
      "wrong_answer",
      "time_limit",
      "runtime_error",
      "compile_error",
      "memory_limit",
    ].includes(value),
}));

vi.mock("@/lib/validators/api", () => ({
  judgeStatusReportSchema: {
    safeParse: (value: unknown) => ({ success: true, data: value }),
  },
}));

vi.mock("@/lib/db-time", () => ({
  getDbNowUncached: vi.fn().mockResolvedValue(new Date("2026-04-20T12:00:00Z")),
}));

vi.mock("@/lib/db/schema", () => ({
  submissions: { id: "submissions.id", judgeClaimToken: "submissions.claim", judgeWorkerId: "submissions.worker" },
  submissionResults: { submissionId: "submission_results.submission_id" },
  judgeWorkers: { id: "judge_workers.id", activeTasks: "judge_workers.active_tasks" },
}));

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      submissions: {
        findFirst: submissionsFindFirstMock,
      },
    },
    transaction: dbTransactionMock,
  },
  execTransaction: execTransactionMock,
}));

describe("POST /api/v1/judge/poll", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isJudgeAuthorizedMock.mockReturnValue(true);
    isJudgeAuthorizedForWorkerMock.mockResolvedValue({ authorized: true });
    buildSubmissionResultRowsMock.mockReturnValue([]);
    computeFinalJudgeMetricsMock.mockReturnValue({
      score: 100,
      maxExecutionTimeMs: 25,
      maxMemoryUsedKb: 128,
    });
    extractFinalJudgeDetailMock.mockReturnValue({
      failedTestCaseIndex: null,
      runtimeErrorType: null,
    });
  });

  it("refreshes judgeClaimedAt on in-progress reports", async () => {
    submissionsFindFirstMock.mockResolvedValue({
      id: "submission-1",
      status: "queued",
      judgeClaimedAt: new Date("2026-04-14T00:00:00.000Z"),
      judgeWorkerId: "worker-1",
    });

    let updatePayload: Record<string, unknown> | null = null;
    execTransactionMock.mockImplementation(async (callback: (tx: any) => Promise<unknown>) =>
      callback({
        update: () => ({
          set: (payload: Record<string, unknown>) => {
            updatePayload = payload;
            return {
              where: async () => ({ rowCount: 1 }),
            };
          },
        }),
        query: {
          submissions: {
            findFirst: vi.fn().mockResolvedValue({
              id: "submission-1",
              status: "judging",
            }),
          },
        },
      })
    );

    const { POST } = await import("@/app/api/v1/judge/poll/route");
    const response = await POST(
      new NextRequest("http://localhost/api/v1/judge/poll", {
        method: "POST",
        headers: {
          Authorization: "Bearer test-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          submissionId: "submission-1",
          claimToken: "claim-token",
          status: "judging",
          compileOutput: null,
          results: [],
        }),
      })
    );

    expect(response.status).toBe(200);
    expect(updatePayload).toMatchObject({
      status: "judging",
      judgeClaimedAt: expect.any(Date),
      failedTestCaseIndex: null,
      runtimeErrorType: null,
    });
  });

  it("clears worker ownership and decrements active tasks on terminal reports", async () => {
    submissionsFindFirstMock
      .mockResolvedValueOnce({
        id: "submission-1",
        status: "judging",
        judgeClaimedAt: new Date("2026-04-14T00:00:00.000Z"),
        judgeWorkerId: "worker-1",
      })
      .mockResolvedValueOnce({
        id: "submission-1",
        status: "accepted",
      });

    const updatePayloads: Array<Record<string, unknown>> = [];
    dbTransactionMock.mockImplementation(async (callback: (tx: any) => Promise<unknown>) =>
      callback({
        update: () => ({
          set: (payload: Record<string, unknown>) => {
            updatePayloads.push(payload);
            return {
              where: async () => ({ rowCount: 1 }),
            };
          },
        }),
        delete: () => ({
          where: async () => undefined,
        }),
        insert: () => ({
          values: async () => undefined,
        }),
      })
    );

    const { POST } = await import("@/app/api/v1/judge/poll/route");
    const response = await POST(
      new NextRequest("http://localhost/api/v1/judge/poll", {
        method: "POST",
        headers: {
          Authorization: "Bearer test-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          submissionId: "submission-1",
          claimToken: "claim-token",
          status: "accepted",
          compileOutput: null,
          results: [],
        }),
      })
    );

    expect(response.status).toBe(200);
    expect(updatePayloads[0]).toMatchObject({
      status: "accepted",
      judgeClaimToken: null,
      judgeClaimedAt: null,
      judgeWorkerId: null,
      failedTestCaseIndex: null,
      runtimeErrorType: null,
    });
    expect(updatePayloads[1]).toHaveProperty("activeTasks");
  });

  it("stores the first failing test case index and runtime error type on terminal reports", async () => {
    submissionsFindFirstMock
      .mockResolvedValueOnce({
        id: "submission-1",
        status: "judging",
        judgeClaimedAt: new Date("2026-04-14T00:00:00.000Z"),
        judgeWorkerId: "worker-1",
      })
      .mockResolvedValueOnce({
        id: "submission-1",
        status: "runtime_error",
      });

    extractFinalJudgeDetailMock.mockReturnValueOnce({
      failedTestCaseIndex: 1,
      runtimeErrorType: "SIGSEGV",
    });

    const updatePayloads: Array<Record<string, unknown>> = [];
    dbTransactionMock.mockImplementation(async (callback: (tx: any) => Promise<unknown>) =>
      callback({
        update: () => ({
          set: (payload: Record<string, unknown>) => {
            updatePayloads.push(payload);
            return {
              where: async () => ({ rowCount: 1 }),
            };
          },
        }),
        delete: () => ({
          where: async () => undefined,
        }),
        insert: () => ({
          values: async () => undefined,
        }),
      })
    );

    const { POST } = await import("@/app/api/v1/judge/poll/route");
    const response = await POST(
      new NextRequest("http://localhost/api/v1/judge/poll", {
        method: "POST",
        headers: {
          Authorization: "Bearer test-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          submissionId: "submission-1",
          claimToken: "claim-token",
          status: "runtime_error",
          compileOutput: null,
          results: [
            { testCaseId: "tc-1", status: "accepted" },
            { testCaseId: "tc-2", status: "runtime_error", runtimeErrorType: "SIGSEGV" },
          ],
        }),
      })
    );

    expect(response.status).toBe(200);
    expect(updatePayloads[0]).toMatchObject({
      failedTestCaseIndex: 1,
      runtimeErrorType: "SIGSEGV",
    });
  });

  it("requires worker-scoped auth for submissions claimed by a registered worker", async () => {
    submissionsFindFirstMock.mockResolvedValue({
      id: "submission-1",
      status: "queued",
      judgeClaimedAt: new Date("2026-04-14T00:00:00.000Z"),
      judgeWorkerId: "worker-1",
    });
    isJudgeAuthorizedForWorkerMock.mockResolvedValueOnce({
      authorized: false,
      error: "invalidWorkerToken",
    });

    const { POST } = await import("@/app/api/v1/judge/poll/route");
    const response = await POST(
      new NextRequest("http://localhost/api/v1/judge/poll", {
        method: "POST",
        headers: {
          Authorization: "Bearer wrong-worker-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          submissionId: "submission-1",
          claimToken: "claim-token",
          status: "judging",
          compileOutput: null,
          results: [],
        }),
      })
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "invalidWorkerToken" });
    expect(execTransactionMock).not.toHaveBeenCalled();
    expect(dbTransactionMock).not.toHaveBeenCalled();
  });
});
