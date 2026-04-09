import { beforeEach, describe, expect, it, vi } from "vitest";

const { rawQueryAllMock, computeSimilarityRustMock, dbDeleteMock, dbInsertMock, dbTransactionMock } = vi.hoisted(() => ({
  rawQueryAllMock: vi.fn(),
  computeSimilarityRustMock: vi.fn(),
  dbDeleteMock: vi.fn(),
  dbInsertMock: vi.fn(),
  dbTransactionMock: vi.fn(),
}));

vi.mock("@/lib/db/queries", () => ({
  rawQueryAll: rawQueryAllMock,
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
    const { runSimilarityCheck } = await import("@/lib/assignments/code-similarity");

    const result = await runSimilarityCheck("assignment-1");

    expect(result).toMatchObject({
      status: "not_run",
      reason: "no_submissions",
      flaggedPairs: 0,
      submissionCount: 0,
    });
  });

  it("returns not_run with an explicit reason when submissions exceed the current limit", async () => {
    rawQueryAllMock.mockResolvedValue(
      Array.from({ length: 501 }, (_, index) => ({
        userId: `user-${index}`,
        problemId: "problem-1",
        sourceCode: "print(1)",
      }))
    );
    const { MAX_SUBMISSIONS_FOR_SIMILARITY, runSimilarityCheck } = await import("@/lib/assignments/code-similarity");

    const result = await runSimilarityCheck("assignment-1");

    expect(result).toMatchObject({
      status: "not_run",
      reason: "too_many_submissions",
      flaggedPairs: 0,
      submissionCount: 501,
      maxSupportedSubmissions: MAX_SUBMISSIONS_FOR_SIMILARITY,
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

    const { runAndStoreSimilarityCheck } = await import("@/lib/assignments/code-similarity");
    const result = await runAndStoreSimilarityCheck("assignment-1");

    expect(result.status).toBe("completed");
    expect(result.flaggedPairs).toBe(1);
    expect(dbDeleteMock).toHaveBeenCalled();
    expect(dbInsertMock).toHaveBeenCalled();
  });
});
