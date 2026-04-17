import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  dbSelectMock,
  resolveCapabilitiesMock,
  getEffectivePlatformModeMock,
} = vi.hoisted(() => ({
  dbSelectMock: vi.fn(),
  resolveCapabilitiesMock: vi.fn(),
  getEffectivePlatformModeMock: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: async (_namespace: string) => (key: string, values?: Record<string, string | number>) => {
    const messages: Record<string, string> = {
      candidateOverviewTitle: "Candidate overview",
      candidateOverviewDescription: "Overview description",
      availableChallenges: "Available challenges",
      solvedChallenges: "Solved challenges",
      totalAttempts: "Total attempts",
      candidateTimeRemaining: "Time remaining",
      candidateResultsTitle: "Assessment status",
      candidateResultsPending:
        "Results continue to update as your submissions finish and active assessment windows remain open.",
      candidateResultsAssignments: `${values?.count ?? 0} assignments in scope`,
      candidateResultsCompletedAssignments: `${values?.count ?? 0} assignments completed or closed`,
      candidateResultsClosedAssignments: `${values?.count ?? 0} windows closed`,
      candidateScoreSummaryValue: `${values?.score ?? 0} / ${values?.total ?? 0} visible points`,
      candidateScoreVisibleAssignments: `${values?.count ?? 0} score-visible assignments`,
      candidateScoreHiddenAssignments: `${values?.count ?? 0} assessments still hide score details`,
      recentAttempts: "Recent attempts",
      supportedLanguages: "Supported languages",
      supportedLanguagesDescription: "Supported languages description",
      candidateProgressTitle: "Progress snapshot",
      candidateAssignmentActive: "In progress",
      candidateAssignmentComplete: "All attempted",
      candidateAssignmentClosed: "Window closed",
      candidateAssignmentScore: `Score: ${values?.score ?? 0} / ${values?.total ?? 0}`,
      candidateAssignmentResultsHidden: "Results aren't available for this assessment.",
      candidateProblemBreakdownTitle: "Per-problem progress",
      candidateProblemSolved: "Solved",
      candidateProblemAttempted: "Attempted",
      candidateProblemUntried: "Untried",
      viewChallengeProgress: "Open assessment",
      viewChallenges: "View challenges",
      viewAttempts: "View attempts",
      viewAttempt: "View attempt",
      unknown: "Unknown",
      appName: "JudgeKit",
      appDescription: "JudgeKit description",
    };
    if (key === "scoreLabel") return `Score: ${values?.score ?? 0}`;
    if (key === "candidateProgressSummary") {
      return `${values?.solved ?? 0} solved • ${values?.attempted ?? 0} attempted • ${values?.total ?? 0} total`;
    }
    if (key === "candidateProgressSolved") return `${values?.count ?? 0} solved`;
    if (key === "candidateProgressAttempted") return `${values?.count ?? 0} attempted`;
    if (key === "candidateProgressRemaining") return `${values?.count ?? 0} remaining`;
    if (key === "deadlineInfo") return `Deadline: ${values?.date ?? ""}`;
    return messages[key] ?? key;
  },
  getLocale: async () => "en",
}));

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: dbSelectMock,
  },
}));

vi.mock("@/lib/capabilities/cache", () => ({
  resolveCapabilities: resolveCapabilitiesMock,
}));

vi.mock("@/lib/system-settings", () => ({
  getResolvedSystemSettings: async () => ({
    siteTitle: "JudgeKit",
    siteDescription: "JudgeKit description",
    timeZone: "UTC",
  }),
}));

vi.mock("@/lib/platform-mode-context", () => ({
  getEffectivePlatformMode: getEffectivePlatformModeMock,
}));

vi.mock("@/lib/datetime", () => ({
  formatDateTimeInTimeZone: (date: Date) => `FMT:${date.toISOString()}`,
}));

vi.mock("@/components/exam/countdown-timer", () => ({
  CountdownTimer: ({ deadline }: { deadline: number }) => (
    <div data-testid="countdown-timer">{deadline}</div>
  ),
}));

function makeSelectChain(rows: unknown[]) {
  const chain = {
    from: vi.fn(() => chain),
    leftJoin: vi.fn(() => chain),
    innerJoin: vi.fn(() => chain),
    where: vi.fn(() => chain),
    orderBy: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    groupBy: vi.fn(() => chain),
    then: vi.fn((cb: (value: unknown[]) => unknown) => Promise.resolve(cb(rows))),
  };
  return chain;
}

describe("CandidateDashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveCapabilitiesMock.mockResolvedValue(new Set());
    getEffectivePlatformModeMock.mockResolvedValue("recruiting");

    dbSelectMock
      .mockReturnValueOnce(makeSelectChain([{ count: 4 }]))
      .mockReturnValueOnce(makeSelectChain([{ count: 3 }]))
      .mockReturnValueOnce(makeSelectChain([{ count: 12 }]))
      .mockReturnValueOnce(
        makeSelectChain([
          {
            id: "sub-1",
            status: "accepted",
            submittedAt: new Date("2099-01-01T00:00:00.000Z"),
            score: 100,
            problemTitle: "A + B",
          },
        ])
      )
      .mockReturnValueOnce(
        makeSelectChain([
          {
            assignmentId: "assign-1",
            title: "Round 1",
            deadline: new Date("2099-01-02T00:00:00.000Z"),
            showResultsToCandidate: true,
            hideScoresFromCandidates: false,
          },
          {
            assignmentId: "assign-2",
            title: "Round 2",
            deadline: new Date("2000-01-03T00:00:00.000Z"),
            showResultsToCandidate: false,
            hideScoresFromCandidates: true,
          },
        ])
      )
      .mockReturnValueOnce(makeSelectChain([{ count: 2 }]))
      .mockReturnValueOnce(makeSelectChain([{ count: 1 }]))
      .mockReturnValueOnce(
        makeSelectChain([
          { assignmentId: "assign-1", count: 2 },
          { assignmentId: "assign-2", count: 2 },
        ])
      )
      .mockReturnValueOnce(
        makeSelectChain([
          { assignmentId: "assign-1", count: 1 },
          { assignmentId: "assign-2", count: 1 },
        ])
      )
      .mockReturnValueOnce(
        makeSelectChain([{ assignmentId: "assign-1", count: 1 }])
      )
      .mockReturnValueOnce(
        makeSelectChain([
          { assignmentId: "assign-1", problemId: "p-1", title: "A + B", sortOrder: 0, points: 100 },
          { assignmentId: "assign-1", problemId: "p-2", title: "Prefix Sum", sortOrder: 1, points: 100 },
          { assignmentId: "assign-2", problemId: "p-3", title: "Graph Paths", sortOrder: 0, points: 100 },
          { assignmentId: "assign-2", problemId: "p-4", title: "Intervals", sortOrder: 1, points: 100 },
        ])
      )
      .mockReturnValueOnce(
        makeSelectChain([
          { assignmentId: "assign-1", problemId: "p-1", status: "accepted", score: 100 },
          { assignmentId: "assign-1", problemId: "p-2", status: "wrong_answer", score: 0 },
          { assignmentId: "assign-2", problemId: "p-3", status: "accepted", score: 100 },
        ])
      );
  });

  it("shows time remaining and a per-assignment progress snapshot for recruiting candidates", async () => {
    const { CandidateDashboard } = await import(
      "@/app/(dashboard)/dashboard/_components/candidate-dashboard"
    );

    render(
      await CandidateDashboard({
        userId: "candidate-1",
        role: "student",
        assignmentIds: ["assign-1", "assign-2"],
      })
    );

    expect(screen.getByText("Solved challenges")).toBeInTheDocument();
    expect(screen.getByText("Assessment status")).toBeInTheDocument();
    expect(screen.getByText("100 / 200 visible points")).toBeInTheDocument();
    expect(screen.getByText("1 score-visible assignments")).toBeInTheDocument();
    expect(screen.getByText("1 assessments still hide score details")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Results continue to update as your submissions finish and active assessment windows remain open."
      )
    ).toBeInTheDocument();
    expect(screen.getByText("1 solved • 2 attempted • 4 total")).toBeInTheDocument();
    expect(screen.getByText("Progress snapshot")).toBeInTheDocument();
    expect(screen.getAllByText("Per-problem progress")).toHaveLength(2);
    expect(screen.getByText("Round 1")).toBeInTheDocument();
    expect(screen.getByText("Round 2")).toBeInTheDocument();
    expect(screen.getAllByText("A + B").length).toBeGreaterThan(0);
    expect(screen.getByText("Prefix Sum")).toBeInTheDocument();
    expect(screen.getByText("Graph Paths")).toBeInTheDocument();
    expect(screen.getByText("Intervals")).toBeInTheDocument();
    expect(screen.getAllByText("Solved").length).toBeGreaterThan(0);
    expect(screen.getByText("Attempted")).toBeInTheDocument();
    expect(screen.getByText("Untried")).toBeInTheDocument();
    expect(screen.getByText("In progress")).toBeInTheDocument();
    expect(screen.getByText("Window closed")).toBeInTheDocument();
    expect(screen.getByText("Score: 100 / 200")).toBeInTheDocument();
    expect(screen.getByText("Results aren't available for this assessment.")).toBeInTheDocument();
    expect(screen.getByTestId("countdown-timer")).toBeInTheDocument();
    expect(screen.getAllByText("Open assessment")).toHaveLength(2);
  });
});
