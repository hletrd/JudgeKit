import { describe, expect, it, vi } from "vitest";

const { nanoidMock } = vi.hoisted(() => ({
  nanoidMock: vi.fn(() => "mock-nanoid"),
}));

vi.mock("nanoid", () => ({
  nanoid: nanoidMock,
}));

import {
  IN_PROGRESS_JUDGE_STATUSES,
  buildSubmissionResultRows,
  computeFinalJudgeMetrics,
} from "@/lib/judge/verdict";

describe("IN_PROGRESS_JUDGE_STATUSES", () => {
  it("contains 'queued'", () => {
    expect(IN_PROGRESS_JUDGE_STATUSES.has("queued")).toBe(true);
  });

  it("contains 'judging'", () => {
    expect(IN_PROGRESS_JUDGE_STATUSES.has("judging")).toBe(true);
  });

  it("does not contain terminal statuses", () => {
    expect(IN_PROGRESS_JUDGE_STATUSES.has("accepted")).toBe(false);
    expect(IN_PROGRESS_JUDGE_STATUSES.has("wrong_answer")).toBe(false);
    expect(IN_PROGRESS_JUDGE_STATUSES.has("time_limit_exceeded")).toBe(false);
    expect(IN_PROGRESS_JUDGE_STATUSES.has("runtime_error")).toBe(false);
    expect(IN_PROGRESS_JUDGE_STATUSES.has("compile_error")).toBe(false);
  });
});

describe("computeFinalJudgeMetrics", () => {
  it("returns null score/time/memory for undefined input", () => {
    const result = computeFinalJudgeMetrics(undefined);
    expect(result).toEqual({
      score: null,
      maxExecutionTimeMs: null,
      maxMemoryUsedKb: null,
    });
  });

  it("returns null score/time/memory for empty array", () => {
    const result = computeFinalJudgeMetrics([]);
    expect(result).toEqual({
      score: null,
      maxExecutionTimeMs: null,
      maxMemoryUsedKb: null,
    });
  });

  it("returns 100% score when all test cases are accepted", () => {
    const results = [
      { testCaseId: "tc1", status: "accepted", executionTimeMs: 50, memoryUsedKb: 1024 },
      { testCaseId: "tc2", status: "accepted", executionTimeMs: 80, memoryUsedKb: 2048 },
    ];
    const { score } = computeFinalJudgeMetrics(results);
    expect(score).toBe(100);
  });

  it("returns 0% score when no test cases are accepted", () => {
    const results = [
      { testCaseId: "tc1", status: "wrong_answer" },
      { testCaseId: "tc2", status: "time_limit_exceeded" },
    ];
    const { score } = computeFinalJudgeMetrics(results);
    expect(score).toBe(0);
  });

  it("returns correct partial score for 2 out of 4 accepted", () => {
    const results = [
      { testCaseId: "tc1", status: "accepted" },
      { testCaseId: "tc2", status: "accepted" },
      { testCaseId: "tc3", status: "wrong_answer" },
      { testCaseId: "tc4", status: "wrong_answer" },
    ];
    const { score } = computeFinalJudgeMetrics(results);
    expect(score).toBe(50);
  });

  it("returns the max execution time across all results", () => {
    const results = [
      { testCaseId: "tc1", status: "accepted", executionTimeMs: 120 },
      { testCaseId: "tc2", status: "accepted", executionTimeMs: 300 },
      { testCaseId: "tc3", status: "accepted", executionTimeMs: 50 },
    ];
    const { maxExecutionTimeMs } = computeFinalJudgeMetrics(results);
    expect(maxExecutionTimeMs).toBe(300);
  });

  it("returns the max memory usage across all results", () => {
    const results = [
      { testCaseId: "tc1", status: "accepted", memoryUsedKb: 4096 },
      { testCaseId: "tc2", status: "accepted", memoryUsedKb: 8192 },
      { testCaseId: "tc3", status: "accepted", memoryUsedKb: 2048 },
    ];
    const { maxMemoryUsedKb } = computeFinalJudgeMetrics(results);
    expect(maxMemoryUsedKb).toBe(8192);
  });

  it("returns null time/memory when all results are missing those fields", () => {
    const results = [
      { testCaseId: "tc1", status: "accepted" },
      { testCaseId: "tc2", status: "wrong_answer" },
    ];
    const { maxExecutionTimeMs, maxMemoryUsedKb } = computeFinalJudgeMetrics(results);
    expect(maxExecutionTimeMs).toBeNull();
    expect(maxMemoryUsedKb).toBeNull();
  });

  it("ignores missing executionTimeMs/memoryUsedKb and uses only defined values", () => {
    const results = [
      { testCaseId: "tc1", status: "accepted", executionTimeMs: 200 },
      { testCaseId: "tc2", status: "accepted" },
      { testCaseId: "tc3", status: "accepted", memoryUsedKb: 512 },
    ];
    const { maxExecutionTimeMs, maxMemoryUsedKb } = computeFinalJudgeMetrics(results);
    expect(maxExecutionTimeMs).toBe(200);
    expect(maxMemoryUsedKb).toBe(512);
  });
});

describe("buildSubmissionResultRows", () => {
  it("returns empty array for undefined results", () => {
    expect(buildSubmissionResultRows("sub-1", undefined)).toEqual([]);
  });

  it("returns empty array for empty results array", () => {
    expect(buildSubmissionResultRows("sub-1", [])).toEqual([]);
  });

  it("maps results to correct DB row format with nanoid IDs", () => {
    nanoidMock.mockReturnValueOnce("id-1").mockReturnValueOnce("id-2");

    const results = [
      {
        testCaseId: "tc1",
        status: "accepted",
        actualOutput: "42\n",
        executionTimeMs: 100,
        memoryUsedKb: 1024,
      },
      {
        testCaseId: "tc2",
        status: "wrong_answer",
        actualOutput: "0\n",
        executionTimeMs: 200,
        memoryUsedKb: 2048,
      },
    ];

    const rows = buildSubmissionResultRows("sub-42", results);

    expect(rows).toEqual([
      {
        id: "id-1",
        submissionId: "sub-42",
        testCaseId: "tc1",
        status: "accepted",
        actualOutput: "42\n",
        executionTimeMs: 100,
        memoryUsedKb: 1024,
      },
      {
        id: "id-2",
        submissionId: "sub-42",
        testCaseId: "tc2",
        status: "wrong_answer",
        actualOutput: "0\n",
        executionTimeMs: 200,
        memoryUsedKb: 2048,
      },
    ]);
  });

  it("maps absent optional fields to null", () => {
    nanoidMock.mockReturnValueOnce("id-null-test");

    const results = [{ testCaseId: "tc1", status: "runtime_error" }];
    const rows = buildSubmissionResultRows("sub-99", results);

    expect(rows).toEqual([
      {
        id: "id-null-test",
        submissionId: "sub-99",
        testCaseId: "tc1",
        status: "runtime_error",
        actualOutput: null,
        executionTimeMs: null,
        memoryUsedKb: null,
      },
    ]);
  });

  it("generates a unique nanoid for each row", () => {
    nanoidMock.mockClear();
    nanoidMock.mockReturnValueOnce("uid-a").mockReturnValueOnce("uid-b").mockReturnValueOnce("uid-c");

    const results = [
      { testCaseId: "tc1", status: "accepted" },
      { testCaseId: "tc2", status: "accepted" },
      { testCaseId: "tc3", status: "accepted" },
    ];
    const rows = buildSubmissionResultRows("sub-multi", results);

    expect(rows.map((r) => r.id)).toEqual(["uid-a", "uid-b", "uid-c"]);
    expect(nanoidMock).toHaveBeenCalledTimes(3);
  });
});
