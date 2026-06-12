import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAX_SUBMISSIONS_FOR_SIMILARITY,
  runAndStoreSimilarityCheck,
  runSimilarityCheck,
} from "@/lib/assignments/code-similarity";

const { rawQueryAllMock, computeSimilarityRustMock, dbDeleteMock, dbInsertMock, dbTransactionMock } = vi.hoisted(() => ({
  rawQueryAllMock: vi.fn(),
  computeSimilarityRustMock: vi.fn(),
  dbDeleteMock: vi.fn(),
  dbInsertMock: vi.fn(),
  dbTransactionMock: vi.fn(),
}));

vi.mock("@/lib/db/queries", () => ({
  rawQueryAll: rawQueryAllMock,
  rawQueryOne: vi.fn().mockResolvedValue({ now: new Date("2026-04-20T12:00:00Z") }),
}));

vi.mock("@/lib/db-time", () => ({
  getDbNowUncached: vi.fn().mockResolvedValue(new Date("2026-04-20T12:00:00Z")),
}));

vi.mock("@/lib/assignments/code-similarity-client", () => ({
  computeSimilarityRust: computeSimilarityRustMock,
}));

vi.mock("@/lib/db", () => ({
  db: {
    delete: dbDeleteMock,
    insert: dbInsertMock,
    transaction: dbTransactionMock,
  },
}));

vi.mock("nanoid", () => ({
  nanoid: () => "similarity-id",
}));

describe("code similarity status reporting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbDeleteMock.mockReturnValue({ where: vi.fn(async () => undefined) });
    dbInsertMock.mockReturnValue({ values: vi.fn(async () => undefined) });
    dbTransactionMock.mockImplementation(async (callback: (tx: { delete: typeof dbDeleteMock; insert: typeof dbInsertMock }) => Promise<unknown>) =>
      callback({
        delete: dbDeleteMock,
        insert: dbInsertMock,
      })
    );
  });

  it("returns not_run when there are no submissions", async () => {
    rawQueryAllMock.mockResolvedValue([]);

    const result = await runSimilarityCheck("assignment-1");

    expect(result).toMatchObject({
      status: "not_run",
      reason: "no_submissions",
      flaggedPairs: 0,
      submissionCount: 0,
    });
  });

  it("partitions best-submission selection by language in the similarity SQL", async () => {
    rawQueryAllMock.mockResolvedValue([]);

    await runSimilarityCheck("assignment-1");

    expect(rawQueryAllMock).toHaveBeenCalledOnce();
    expect(String(rawQueryAllMock.mock.calls[0]?.[0])).toContain(
      "PARTITION BY user_id, problem_id, language"
    );
  });

  it("tries the Rust sidecar, then reports too_many_submissions for oversized contests (AGG5-5)", async () => {
    rawQueryAllMock.mockResolvedValue(
      Array.from({ length: 501 }, (_, index) => ({
        userId: `user-${index}`,
        problemId: "problem-1",
        sourceCode: "print(1)",
      }))
    );
    computeSimilarityRustMock.mockResolvedValue(null);

    const result = await runSimilarityCheck("assignment-1");

    expect(computeSimilarityRustMock).toHaveBeenCalledOnce();
    // The declared enum member and its translated dashboard branch were
    // unreachable while this guard returned "service_unavailable": the COUNT
    // is what blocks the TS fallback engine; the sidecar being absent is the
    // precondition for reaching the guard at all.
    expect(result).toMatchObject({
      status: "not_run",
      reason: "too_many_submissions",
      flaggedPairs: 0,
      submissionCount: 501,
      maxSupportedSubmissions: MAX_SUBMISSIONS_FOR_SIMILARITY,
    });
  });

  it("completes regardless of submission count when the Rust sidecar answers", async () => {
    rawQueryAllMock.mockResolvedValue(
      Array.from({ length: 501 }, (_, index) => ({
        userId: `user-${index}`,
        problemId: "problem-1",
        sourceCode: "print(1)",
      }))
    );
    computeSimilarityRustMock.mockResolvedValue([]);

    const result = await runSimilarityCheck("assignment-1");

    expect(result).toMatchObject({
      status: "completed",
      reason: null,
      submissionCount: 501,
    });
  });

  it("returns completed and persists flagged pairs only when similarity actually runs", async () => {
    rawQueryAllMock.mockResolvedValue([
      { userId: "u1", problemId: "p1", sourceCode: "print(1)" },
      { userId: "u2", problemId: "p1", sourceCode: "print(1)" },
    ]);
    computeSimilarityRustMock.mockResolvedValue([
      { userId1: "u1", userId2: "u2", problemId: "p1", similarity: 0.99 },
    ]);

    const result = await runAndStoreSimilarityCheck("assignment-1");

    expect(result.status).toBe("completed");
    expect(result.flaggedPairs).toBe(1);
    expect(dbDeleteMock).toHaveBeenCalled();
    expect(dbInsertMock).toHaveBeenCalled();
  });

  it("persists the language bucket in code_similarity evidence details (AGG6-7)", async () => {
    rawQueryAllMock.mockResolvedValue([
      { userId: "u1", problemId: "p1", language: "python", sourceCode: "print(1)" },
      { userId: "u2", problemId: "p1", language: "python", sourceCode: "print(1)" },
    ]);
    computeSimilarityRustMock.mockResolvedValue([
      { userId1: "u1", userId2: "u2", problemId: "p1", language: "python", similarity: 0.99 },
    ]);
    const valuesFn = vi.fn(async (_rows: unknown) => undefined);
    dbInsertMock.mockReturnValue({ values: valuesFn });

    await runAndStoreSimilarityCheck("assignment-1");

    expect(valuesFn).toHaveBeenCalledTimes(1);
    const rows = valuesFn.mock.calls[0][0] as Array<{ details: string }>;
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(JSON.parse(row.details)).toMatchObject({
        problemId: "p1",
        language: "python",
        similarity: 0.99,
      });
    }
  });

  it("still flags renamed-variable solutions when the TypeScript fallback runs", async () => {
    rawQueryAllMock.mockResolvedValue([
      {
        userId: "u1",
        problemId: "p1",
        sourceCode: "int solve() { int total = left + right; return total; }",
      },
      {
        userId: "u2",
        problemId: "p1",
        sourceCode: "int solve() { int answer = alpha + beta; return answer; }",
      },
    ]);
    computeSimilarityRustMock.mockResolvedValue(null);

    const result = await runSimilarityCheck("assignment-1", 0.85, 3);

    expect(result).toMatchObject({
      status: "completed",
      reason: null,
      flaggedPairs: 1,
      submissionCount: 2,
    });
    expect(result.pairs[0]).toMatchObject({
      userId1: "u1",
      userId2: "u2",
      problemId: "p1",
    });
  });
});
