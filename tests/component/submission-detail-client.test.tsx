import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { SubmissionDetailClient } from "@/components/submissions/submission-detail-client";

const apiFetchMock = vi.fn();

vi.mock("next-intl", () => ({
  useTranslations: (_namespace: string) => (key: string, values?: Record<string, unknown>) => {
    if (values && typeof values === "object") {
      return `${key}:${JSON.stringify(values)}`;
    }
    return key;
  },
  useLocale: () => "en-US",
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/lib/api/client", () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock("@/hooks/use-submission-polling", () => ({
  useSubmissionPolling: (initial: unknown) => ({
    submission: initial,
    setSubmission: vi.fn(),
    error: false,
  }),
  normalizeSubmission: (data: unknown) => data,
}));

vi.mock("@/components/code/code-viewer", () => ({
  CodeViewer: () => <pre>code</pre>,
}));

vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
}));

vi.mock("@/components/submission-status-badge", () => ({
  SubmissionStatusBadge: () => <span>status</span>,
}));

vi.mock("@/components/ui/card", () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardDescription: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/table", () => ({
  Table: ({ children }: { children: React.ReactNode }) => <table>{children}</table>,
  TableHeader: ({ children }: { children: React.ReactNode }) => <thead>{children}</thead>,
  TableBody: ({ children }: { children: React.ReactNode }) => <tbody>{children}</tbody>,
  TableRow: ({ children }: { children: React.ReactNode }) => <tr>{children}</tr>,
  TableHead: ({ children }: { children: React.ReactNode }) => <th>{children}</th>,
  TableCell: ({ children }: { children: React.ReactNode }) => <td>{children}</td>,
}));

vi.mock("@/components/submissions/_components/submission-result-panel", () => ({
  SubmissionResultPanel: () => <div>results</div>,
}));

vi.mock("@/components/submissions/_components/comment-section", () => ({
  CommentSection: () => <div>comments</div>,
}));

vi.mock("@/components/submissions/_components/live-submission-status", () => ({
  LiveSubmissionStatus: () => <div>live-status</div>,
}));

vi.mock("@/components/submissions/output-diff-view", () => ({
  OutputDiffView: () => <div>diff</div>,
}));

vi.mock("@/lib/datetime", () => ({
  formatDateTimeInTimeZone: () => "2026-04-16 00:00:00",
}));

vi.mock("@/lib/formatting", () => ({
  formatScore: (n: number) => String(n),
}));

vi.mock("@/lib/submissions/format", () => ({
  formatSubmissionIdPrefix: (id: string) => id.slice(0, 12),
}));

vi.mock("@/lib/judge/languages", () => ({
  getLanguageDisplayLabel: (lang: string) => lang,
}));

function makeProps(overrides: { status?: string; id?: string } = {}) {
  return {
    showCompileOutput: true,
    showDetailedResults: true,
    showRuntimeErrors: true,
    initialSubmission: {
      id: overrides.id ?? "submission-1234567890ab",
      assignmentId: null,
      language: "python",
      status: overrides.status ?? "queued",
      sourceCode: "print(1)",
      compileOutput: null,
      executionTimeMs: null,
      memoryUsedKb: null,
      score: null,
      submittedAt: 1713292800000,
      failedTestCaseIndex: null,
      runtimeErrorType: null,
      user: { name: "alice" },
      problem: { id: "problem-1", title: "Hello World" },
      results: [],
    },
    backHref: "/submissions",
    timeZone: "UTC",
    userId: "user-1",
    capabilities: [] as string[],
    problemTimeLimitMs: null,
    canViewSource: true,
    isOwner: true,
  };
}

describe("SubmissionDetailClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiFetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ data: { queuePosition: 2, gradingTestCase: null } }),
    });
  });

  afterEach(() => {
    cleanup();
    // Reset visibility state
    Object.defineProperty(document, "visibilityState", {
      writable: true,
      configurable: true,
      value: "visible",
    });
  });

  it("mount triggers queue-status fetch with AbortController signal when submission is active", async () => {
    render(<SubmissionDetailClient {...makeProps({ status: "queued" })} />);

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith(
        "/api/v1/submissions/submission-1234567890ab/queue-status",
        expect.objectContaining({ signal: expect.any(AbortSignal), cache: "no-store" })
      );
    });
  });

  it("unmount aborts the in-flight queue-status request", async () => {
    let capturedSignal: AbortSignal | undefined;

    apiFetchMock.mockImplementation(async (_input: unknown, init: unknown) => {
      const opts = (init ?? {}) as { signal?: AbortSignal };
      capturedSignal = opts.signal;
      // Return a promise that never resolves to simulate an in-flight request
      return new Promise(() => {});
    });

    const { unmount } = render(<SubmissionDetailClient {...makeProps({ status: "queued" })} />);

    await waitFor(() => expect(capturedSignal).toBeDefined());

    unmount();

    expect(capturedSignal!.aborted).toBe(true);
  });

  it("visibility change to visible triggers an immediate queue-status poll", async () => {
    let pollCount = 0;

    apiFetchMock.mockImplementation(async (input: unknown, _init: unknown) => {
      if (typeof input === "string" && input.includes("queue-status")) {
        pollCount++;
      }
      return {
        ok: true,
        json: async () => ({ data: { queuePosition: 2, gradingTestCase: null } }),
      };
    });

    render(<SubmissionDetailClient {...makeProps({ status: "queued" })} />);

    await waitFor(() => expect(pollCount).toBeGreaterThanOrEqual(1));
    const initialCount = pollCount;

    // Simulate tab becoming hidden
    Object.defineProperty(document, "visibilityState", {
      writable: true,
      configurable: true,
      value: "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));

    // Simulate tab becoming visible again — should trigger immediate poll
    Object.defineProperty(document, "visibilityState", {
      writable: true,
      configurable: true,
      value: "visible",
    });
    document.dispatchEvent(new Event("visibilitychange"));

    await waitFor(() => expect(pollCount).toBeGreaterThan(initialCount));
  });

  it("does not poll queue-status when submission is not active", async () => {
    render(<SubmissionDetailClient {...makeProps({ status: "accepted" })} />);

    // Wait a tick to let effects run
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(apiFetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining("queue-status"),
      expect.anything()
    );
  });
});
