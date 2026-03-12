"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api/client";
import { ACTIVE_SUBMISSION_STATUSES } from "@/lib/submissions/status";

type SubmissionResultView = {
  id: string;
  status: string;
  executionTimeMs: number | null;
  memoryUsedKb: number | null;
  testCase: {
    sortOrder: number | null;
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

function normalizeSubmission(data: Record<string, unknown>): SubmissionDetailView {
  const results = Array.isArray(data.results)
    ? data.results.map((result) => {
        const record = result as Record<string, unknown>;
        const testCase = record.testCase as Record<string, unknown> | null;

        return {
          id: String(record.id),
          status: String(record.status),
          executionTimeMs:
            typeof record.executionTimeMs === "number" ? record.executionTimeMs : null,
          memoryUsedKb: typeof record.memoryUsedKb === "number" ? record.memoryUsedKb : null,
          testCase: testCase
            ? {
                sortOrder:
                  typeof testCase.sortOrder === "number" ? testCase.sortOrder : null,
              }
            : null,
        };
      })
    : [];

  const user = data.user as Record<string, unknown> | null;
  const problem = data.problem as Record<string, unknown> | null;
  const submittedAtValue = data.submittedAt;
  const submittedAt =
    typeof submittedAtValue === "number"
      ? submittedAtValue
      : typeof submittedAtValue === "string"
        ? Date.parse(submittedAtValue)
        : null;

  return {
    id: String(data.id),
    assignmentId: typeof data.assignmentId === "string" ? data.assignmentId : null,
    language: String(data.language),
    status: String(data.status),
    sourceCode: String(data.sourceCode),
    compileOutput: typeof data.compileOutput === "string" ? data.compileOutput : null,
    executionTimeMs: typeof data.executionTimeMs === "number" ? data.executionTimeMs : null,
    memoryUsedKb: typeof data.memoryUsedKb === "number" ? data.memoryUsedKb : null,
    score: typeof data.score === "number" ? data.score : null,
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
        const response = await apiFetch(`/api/v1/submissions/${submission.id}`, {
          cache: "no-store",
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error("submissionRefreshFailed");
        }

        const payload = (await response.json()) as { data?: Record<string, unknown> };

        if (!payload.data) {
          throw new Error("submissionPayloadMissing");
        }

        if (isCancelled) {
          return;
        }

        const nextSubmission = normalizeSubmission(payload.data);
        setSubmission(nextSubmission);
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

        setError(true);
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

    void refreshSubmission();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      isCancelled = true;
      setIsPolling(false);
      controller.abort();
      clearScheduledRefresh();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isLive, submission.id]);

  return { submission, setSubmission, isPolling: isLive && isPolling, error };
}
