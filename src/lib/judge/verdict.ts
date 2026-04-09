import { nanoid } from "nanoid";

export const IN_PROGRESS_JUDGE_STATUSES = new Set(["pending", "queued", "judging"]);

type JudgeResultInput = {
  testCaseId: string;
  status: string;
  actualOutput?: string;
  executionTimeMs?: number;
  memoryUsedKb?: number;
};

export function computeFinalJudgeMetrics(results: JudgeResultInput[] | undefined) {
  let score: number | null = null;
  let maxExecutionTimeMs: number | null = null;
  let maxMemoryUsedKb: number | null = null;

  if (Array.isArray(results) && results.length > 0) {
    const passed = results.filter((result) => result.status === "accepted").length;
    score = Math.round((passed * 10000) / results.length) / 100;

    const times = results
      .map((result) => result.executionTimeMs)
      .filter((value): value is number => typeof value === "number");
    if (times.length > 0) {
      maxExecutionTimeMs = times.reduce((max, t) => Math.max(max, t), 0);
    }

    const memories = results
      .map((result) => result.memoryUsedKb)
      .filter((value): value is number => typeof value === "number");
    if (memories.length > 0) {
      maxMemoryUsedKb = memories.reduce((max, m) => Math.max(max, m), 0);
    }
  }

  return {
    maxExecutionTimeMs,
    maxMemoryUsedKb,
    score,
  };
}

export function buildSubmissionResultRows(
  submissionId: string,
  results: JudgeResultInput[] | undefined
) {
  if (!Array.isArray(results) || results.length === 0) {
    return [];
  }

  return results.map((result) => ({
    id: nanoid(),
    submissionId,
    testCaseId: result.testCaseId,
    status: result.status,
    actualOutput: result.actualOutput ?? null,
    executionTimeMs: result.executionTimeMs ?? null,
    memoryUsedKb: result.memoryUsedKb ?? null,
  }));
}
