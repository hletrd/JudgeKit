import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SubmissionResultPanel } from "@/components/submissions/_components/submission-result-panel";
import type { SubmissionResultView } from "@/hooks/use-submission-polling";

// Task 21 — pin per-test verdict rendering for FUNCTION submissions.
//
// The per-test verdict data shape is identical to normal problems: each result
// carries a status, timing, an `actualOutput`, and a `testCase` whose
// `expectedOutput` is present only for VISIBLE cases (the visibility layer
// strips it for hidden ones). For a function submission the I/O is just the
// serialized args/return — so the existing renderer handles it unchanged.
// These tests pin that:
//   * a visible WRONG-ANSWER case surfaces expected vs got (the diff view);
//   * a hidden case surfaces only pass/fail (status), no I/O;
//   * everything is gated behind showDetailedResults.

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, vars?: Record<string, unknown>) =>
    vars ? `${key}:${JSON.stringify(vars)}` : key,
  useLocale: () => "en-US",
}));

vi.mock("@/components/code/code-viewer", () => ({
  CodeViewer: ({ value }: { value: string }) => <pre data-testid="code-viewer">{value}</pre>,
}));

vi.mock("@/components/submission-status-badge", () => ({
  SubmissionStatusBadge: ({ label, status }: { label: string; status: string }) => (
    <span data-testid="status-badge" data-status={status}>
      {label}
    </span>
  ),
}));

// Expose the diff view's inputs so we can assert function I/O (expected vs got).
vi.mock("@/components/submissions/output-diff-view", () => ({
  OutputDiffView: ({ expectedOutput, actualOutput }: { expectedOutput: string; actualOutput: string }) => (
    <div data-testid="output-diff" data-expected={expectedOutput} data-actual={actualOutput} />
  ),
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
  TableCell: ({ children, colSpan }: { children: React.ReactNode; colSpan?: number }) => (
    <td colSpan={colSpan}>{children}</td>
  ),
}));

// twoSum: a visible WRONG_ANSWER case (serialized args + expected vs got
// returns), plus a hidden ACCEPTED case (expectedOutput stripped by visibility).
const results: SubmissionResultView[] = [
  {
    id: "r1",
    status: "wrong_answer",
    executionTimeMs: 12,
    memoryUsedKb: 2048,
    actualOutput: "[1,2]",
    testCase: { sortOrder: 0, isVisible: true, expectedOutput: "[0,1]" },
  },
  {
    id: "r2",
    status: "accepted",
    executionTimeMs: 8,
    memoryUsedKb: 2000,
    actualOutput: null,
    testCase: { sortOrder: 1, isVisible: false, expectedOutput: null },
  },
];

describe("SubmissionResultPanel — function submission verdicts", () => {
  afterEach(() => cleanup());

  it("renders a status (pass/fail) row for every case when showDetailedResults", () => {
    render(
      <SubmissionResultPanel
        showCompileOutput={false}
        showDetailedResults
        showRuntimeErrors
        compileOutput={null}
        results={results}
      />,
    );

    const badges = screen.getAllByTestId("status-badge");
    expect(badges).toHaveLength(2);
    const statuses = badges.map((b) => b.getAttribute("data-status"));
    expect(statuses).toContain("wrong_answer");
    expect(statuses).toContain("accepted");
  });

  it("surfaces expected vs got (function I/O) for a VISIBLE wrong-answer case", () => {
    render(
      <SubmissionResultPanel
        showCompileOutput={false}
        showDetailedResults
        showRuntimeErrors
        compileOutput={null}
        results={results}
      />,
    );

    const diff = screen.getByTestId("output-diff");
    expect(diff.getAttribute("data-expected")).toBe("[0,1]");
    expect(diff.getAttribute("data-actual")).toBe("[1,2]");
  });

  it("shows only pass/fail (no I/O) for a HIDDEN case", () => {
    render(
      <SubmissionResultPanel
        showCompileOutput={false}
        showDetailedResults
        showRuntimeErrors
        compileOutput={null}
        results={results}
      />,
    );

    // Exactly one diff view (the visible case); the hidden accepted case
    // exposes no expected/actual I/O.
    expect(screen.getAllByTestId("output-diff")).toHaveLength(1);
  });

  it("hides all per-test detail when showDetailedResults is false", () => {
    render(
      <SubmissionResultPanel
        showCompileOutput={false}
        showDetailedResults={false}
        showRuntimeErrors
        compileOutput={null}
        results={results}
      />,
    );

    expect(screen.queryByTestId("status-badge")).toBeNull();
    expect(screen.queryByTestId("output-diff")).toBeNull();
    expect(screen.getByText("detailedResultsHidden")).toBeInTheDocument();
  });
});
