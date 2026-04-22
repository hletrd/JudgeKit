import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEffect } from "react";
import { SubmissionOverview } from "@/components/lecture/submission-overview";

const apiFetchMock = vi.fn();

vi.mock("next-intl", () => ({
  useTranslations: (_namespace: string) => (key: string, values?: Record<string, number>) => {
    if (key === "acceptedSummary") {
      return `${values?.accepted ?? 0}/${values?.total ?? 0}`;
    }
    if (key === "acceptedCount") return `accepted:${values?.count ?? 0}`;
    if (key === "wrongCount") return `wrong:${values?.count ?? 0}`;
    if (key === "compileRuntimeCount") return `compileRuntime:${values?.count ?? 0}`;
    if (key === "timeLimitCount") return `timeLimit:${values?.count ?? 0}`;
    if (key === "pendingCount") return `pending:${values?.count ?? 0}`;
    return key;
  },
  useLocale: () => "en-US",
}));

vi.mock("@/lib/api/client", () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

vi.mock("@/lib/judge/status-labels", () => ({
  buildStatusLabels: () => ({
    accepted: "Accepted",
    wrong_answer: "Wrong Answer",
    compile_error: "Compile Error",
    runtime_error: "Runtime Error",
    pending: "Pending",
    queued: "Queued",
    judging: "Judging",
  }),
}));

vi.mock("@/hooks/use-visibility-polling", () => ({
  useVisibilityPolling: (callback: () => void, intervalMs: number) => {
    // Simulate the real hook: call once immediately, then set interval.
    // Uses useEffect to avoid calling during render.
    useEffect(() => {
      callback();
      const id = setInterval(callback, intervalMs);
      return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
  },
}));

vi.mock("@/lib/formatting", () => ({
  formatNumber: (n: number) => String(n),
}));

describe("SubmissionOverview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiFetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          total: 2,
          summary: { accepted: 1, wrong_answer: 1 },
          submissions: [
            {
              id: "sub-1",
              status: "accepted",
              language: "python",
              submittedAt: "2026-04-17T00:00:00Z",
              userId: "user-1",
            },
          ],
        },
      }),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("loads lecture submission stats via apiFetch with assignment and summary parameters", async () => {
    render(
      <SubmissionOverview
        assignmentId="assignment-1"
        problemId="problem-1"
        open
        onClose={() => {}}
      />
    );

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith(
        "/api/v1/submissions?problemId=problem-1&limit=10&includeSummary=1&assignmentId=assignment-1"
      );
    });

    expect(screen.getByText("50%")).toBeInTheDocument();
    expect(screen.getByText("Accepted")).toBeInTheDocument();
  });

  it("polls through apiFetch while the overview stays open", async () => {
    vi.useFakeTimers();
    render(
      <SubmissionOverview
        assignmentId={null}
        problemId="problem-2"
        open
        onClose={() => {}}
      />
    );

    await act(async () => {
      await Promise.resolve();
    });
    expect(apiFetchMock).toHaveBeenCalledWith(
      "/api/v1/submissions?problemId=problem-2&limit=10&includeSummary=1"
    );
    expect(apiFetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(5000);
      await Promise.resolve();
    });

    expect(apiFetchMock).toHaveBeenCalledTimes(2);
  });
});
