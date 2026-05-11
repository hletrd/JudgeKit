"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api/client";
import { ACTIVE_SUBMISSION_STATUSES } from "@/lib/submissions/status";

type SubmissionResultView = {
  id: string;
  status: string;
  executionTimeMs: number | null;
  memoryUsedKb: number | null;
  actualOutput: string | null;
  testCase: {
    sortOrder: number | null;
    isVisible?: boolean;
    expectedOutput?: string | null;
  } | null;
};

type SubmissionDetailView = {
  id: string;
  assignmentId: string | null;
  language: string;
  status: string;
  sourceCode: string;
  compileOutput: string | null;
  executionTimeMs: number | null;
  memoryUsedKb: number | null;
  score: number | null;
  submittedAt: number | null;
  failedTestCaseIndex: number | null;
  runtimeErrorType: string | null;
  user: {
    name: string | null;
  } | null;
  problem: {
    id: string;
    title: string;
  } | null;
  results: SubmissionResultView[];
};

export type { SubmissionResultView, SubmissionDetailView };

function normalizeSubmission(data: unknown): SubmissionDetailView {
  const record =
    data !== null && typeof data === "object" && !Array.isArray(data)
      ? data as Record<string, unknown>
      : {};

  const results = Array.isArray(record.results)
    ? record.results.map((result: unknown) => {
        const resultRecord =
          result !== null && typeof result === "object" && !Array.isArray(result)
            ? result as Record<string, unknown>
            : {};
        const rawTestCase = resultRecord.testCase;
        const testCase: Record<string, unknown> | null =
          rawTestCase !== null && typeof rawTestCase === "object" && !Array.isArray(rawTestCase)
            ? rawTestCase as Record<string, unknown>
            : null;

        return {
          id: String(resultRecord.id),
          status: String(resultRecord.status),
          executionTimeMs:
            typeof resultRecord.executionTimeMs === "number" && Number.isFinite(resultRecord.executionTimeMs) ? resultRecord.executionTimeMs : null,
          memoryUsedKb: typeof resultRecord.memoryUsedKb === "number" && Number.isFinite(resultRecord.memoryUsedKb) ? resultRecord.memoryUsedKb : null,
          actualOutput: typeof resultRecord.actualOutput === "string" ? resultRecord.actualOutput : null,
          testCase: testCase
            ? {
                sortOrder:
                  typeof testCase.sortOrder === "number" && Number.isFinite(testCase.sortOrder) ? testCase.sortOrder : null,
                isVisible: typeof testCase.isVisible === "boolean" ? testCase.isVisible : undefined,
                expectedOutput: typeof testCase.expectedOutput === "string" ? testCase.expectedOutput : null,
              }
            : null,
        };
      })
    : [];

  const rawUser = record.user;
  const user: Record<string, unknown> | null =
    rawUser !== null && typeof rawUser === "object" && !Array.isArray(rawUser)
      ? rawUser as Record<string, unknown>
      : null;
  const rawProblem = record.problem;
  const problem: Record<string, unknown> | null =
    rawProblem !== null && typeof rawProblem === "object" && !Array.isArray(rawProblem)
      ? rawProblem as Record<string, unknown>
      : null;
  const submittedAtValue = record.submittedAt;
  const submittedAt =
    typeof submittedAtValue === "number" && Number.isFinite(submittedAtValue)
      ? submittedAtValue
      : typeof submittedAtValue === "string"
        ? Date.parse(submittedAtValue)
        : null;

  return {
    id: String(record.id),
    assignmentId: typeof record.assignmentId === "string" ? record.assignmentId : null,
    language: String(record.language),
    status: String(record.status),
    sourceCode: typeof record.sourceCode === "string" ? record.sourceCode : "",
    compileOutput: typeof record.compileOutput === "string" ? record.compileOutput : null,
    executionTimeMs: typeof record.executionTimeMs === "number" && Number.isFinite(record.executionTimeMs) ? record.executionTimeMs : null,
    memoryUsedKb: typeof record.memoryUsedKb === "number" && Number.isFinite(record.memoryUsedKb) ? record.memoryUsedKb : null,
    score: typeof record.score === "number" && Number.isFinite(record.score) ? record.score : null,
    failedTestCaseIndex: typeof record.failedTestCaseIndex === "number" && Number.isFinite(record.failedTestCaseIndex) ? record.failedTestCaseIndex : null,
    runtimeErrorType: typeof record.runtimeErrorType === "string" ? record.runtimeErrorType : null,
    submittedAt,
    user: user
      ? {
          name: typeof user.name === "string" ? user.name : null,
        }
      : null,
    problem:
      problem && typeof problem.id === "string" && typeof problem.title === "string"
        ? {
            id: problem.id,
            title: problem.title,
          }
        : null,
    results,
  };
}

export { normalizeSubmission };

/**
 * Try SSE (EventSource) for real-time updates. If EventSource is unavailable
 * or the connection fails, fall back to fetch-based polling.
 */
export function useSubmissionPolling(initialSubmission: SubmissionDetailView) {
  const [submission, setSubmission] = useState(initialSubmission);
  const [isPolling, setIsPolling] = useState(false);
  const [error, setError] = useState(false);

  const isLive = ACTIVE_SUBMISSION_STATUSES.has(submission.status);

  useEffect(() => {
    if (!isLive) {
      setError(false);
      setIsPolling(false);
      return undefined;
    }

    setIsPolling(true);

    // ---- SSE attempt ----
    if (typeof EventSource !== "undefined") {
      let sseActive = true;
      const es = new EventSource(`/api/v1/submissions/${submission.id}/events`);

      es.addEventListener("result", (event: MessageEvent) => {
        if (!sseActive) return;
        try {
          const data = JSON.parse(event.data);
          const normalized = normalizeSubmission(data);
          setSubmission((prev) => ({ ...normalized, sourceCode: normalized.sourceCode || prev.sourceCode }));
          setError(false);
          setIsPolling(false);
        } catch {
          // Parse failure — SSE will close and we fall back to fetch polling.
          setIsPolling(false);
          setError(true);
          es.close();
          sseActive = false;
          startFetchPolling();
          return;
        }
        es.close();
        sseActive = false;
      });

      es.addEventListener("timeout", () => {
        if (!sseActive) return;
        es.close();
        sseActive = false;
        setIsPolling(false);
      });

      es.onerror = () => {
        if (!sseActive) return;
        // SSE failed — close and fall back to fetch polling
        es.close();
        sseActive = false;
        startFetchPolling();
      };

      // Track cleanup references for fetch-polling fallback
      let fallbackCleanup: (() => void) | null = null;

      function startFetchPolling() {
        fallbackCleanup = initFetchPolling(submission.id, setSubmission, setIsPolling, setError);
      }

      return () => {
        sseActive = false;
        es.close();
        fallbackCleanup?.();
      };
    }

    // ---- Fallback: fetch polling ----
    const cleanup = initFetchPolling(submission.id, setSubmission, setIsPolling, setError);
    return cleanup;
  }, [isLive, submission.id]);

  return { submission, setSubmission, isPolling: isLive && isPolling, error };
}

/**
 * Fetch-based polling as fallback when SSE is unavailable or fails.
 * Returns a cleanup function.
 */
function initFetchPolling(
  submissionId: string,
  setSubmission: React.Dispatch<React.SetStateAction<SubmissionDetailView>>,
  setIsPolling: React.Dispatch<React.SetStateAction<boolean>>,
  setError: React.Dispatch<React.SetStateAction<boolean>>
): () => void {
  const controller = new AbortController();
  let isCancelled = false;
  let timeoutId: number | null = null;
  let delayMs = 3000;

  function clearScheduledRefresh() {
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId);
      timeoutId = null;
    }
  }

  function scheduleRefresh() {
    clearScheduledRefresh();

    if (isCancelled || document.visibilityState === "hidden") {
      return;
    }

    timeoutId = window.setTimeout(() => {
      void refreshSubmission();
    }, delayMs);
  }

  async function refreshSubmission() {
    if (document.visibilityState === "hidden") {
      clearScheduledRefresh();
      return;
    }

    try {
      const response = await apiFetch(`/api/v1/submissions/${submissionId}`, {
        cache: "no-store",
        signal: controller.signal,
      });

      if (!response.ok) {
        // Preserve status for error-classification below.
        throw new Error(`submissionRefreshFailed:${response.status}`);
      }

      const payload = await response.json().catch(() => ({ data: null }));

      if (typeof payload !== "object" || payload === null || !("data" in payload)) {
        throw new Error("submissionPayloadMissing");
      }
      const data = payload.data;
      if (data === null || data === undefined) {
        throw new Error("submissionPayloadMissing");
      }

      if (isCancelled) {
        return;
      }

      const nextSubmission = normalizeSubmission(data);
      setSubmission((prev) => ({ ...nextSubmission, sourceCode: nextSubmission.sourceCode || prev.sourceCode }));
      setError(false);
      delayMs = 3000;

      if (ACTIVE_SUBMISSION_STATUSES.has(nextSubmission.status)) {
        scheduleRefresh();
      } else {
        setIsPolling(false);
      }
    } catch (err) {
      if (isCancelled || (err instanceof DOMException && err.name === "AbortError")) {
        return;
      }

      // Classify errors: stop polling on terminal statuses (404/403),
      // back off on 5xx and network errors.
      const statusMatch =
        err instanceof Error ? err.message.match(/submissionRefreshFailed:(\d+)/) : null;
      const statusCode = statusMatch ? parseInt(statusMatch[1], 10) : null;
      const isTerminalError = statusCode === 404 || statusCode === 403;

      setError(true);

      if (isTerminalError) {
        setIsPolling(false);
        return;
      }

      delayMs = Math.min(delayMs * 2, 30000);
      scheduleRefresh();
    }
  }

  function handleVisibilityChange() {
    if (document.visibilityState === "hidden") {
      clearScheduledRefresh();
      return;
    }

    if (!isCancelled) {
      void refreshSubmission();
    }
  }

  setIsPolling(true);
  void refreshSubmission();
  document.addEventListener("visibilitychange", handleVisibilityChange);

  return () => {
    isCancelled = true;
    setIsPolling(false);
    controller.abort();
    clearScheduledRefresh();
    document.removeEventListener("visibilitychange", handleVisibilityChange);
  };
}
