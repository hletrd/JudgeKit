import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { AssignmentOverview } from "@/components/assignment/assignment-overview";
import { DEFAULT_PROBLEM_POINTS } from "@/lib/assignments/constants";

const backMock = vi.fn();

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    onClick,
  }: {
    href: string;
    children: ReactNode;
    onClick?: (event: React.MouseEvent<HTMLAnchorElement>) => void;
  }) => (
    <a href={href} onClick={onClick}>
      {children}
    </a>
  ),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: backMock, push: vi.fn() }),
}));

vi.mock("@/components/exam/countdown-timer", () => ({
  CountdownTimer: ({ label }: { label?: string }) => <span>{label ?? "countdown"}</span>,
}));

describe("AssignmentOverview", () => {
  const baseProps = {
    assignment: {
      id: "assignment-1",
      title: "Midterm Exam",
      description: "Test description",
      startsAt: null as Date | null,
      deadline: null as Date | null,
      lateDeadline: null as Date | null,
      latePenalty: null as number | null,
      group: { name: "CS 101" },
      examMode: "windowed",
      examDurationMinutes: 120,
    },
    sortedProblems: [
      { id: "p1", sortOrder: 0, points: 100, problem: { id: "p1", title: "Problem A" } },
      { id: "p2", sortOrder: 1, points: 200, problem: { id: "p2", title: "Problem B" } },
      { id: "p3", sortOrder: 2, points: 150, problem: { id: "p3", title: "Problem C" } },
    ],
    totalPoints: 450, // 100 + 200 + 150 — NOT 550 (the old bug added 100)
    isUpcoming: false,
    isPast: false,
    groupId: "group-1",
    locale: "en-US",
    timeZone: "UTC",
    labels: {
      overviewTitle: "Overview",
      problemsTitle: "Problems",
      descriptionFallback: "No description",
      lateDeadline: "Late deadline",
      latePenalty: "Late penalty",
      points: "Points",
      openProblem: "Open",
      noProblems: "No problems",
      statusUpcoming: "Upcoming",
      statusClosed: "Closed",
      statusOpen: "Open",
      startsAt: "Starts",
      deadline: "Deadline",
      back: "Back",
      groupDetail: "Group",
      action: "Action",
      assignments: "Assignment",
      problemCount: "3 problems",
      titleColumn: "Title",
      deadlineCountdown: "Time remaining",
      lateDeadlineCountdown: "Late deadline",
      solved: "Solved",
      attempted: "Attempted",
      untried: "Not tried",
      examBadgeWindowed: "Windowed 120 min",
      examDuration: "Duration",
    },
    backHref: "/contests",
    problemHrefPrefix: "/practice/problems/",
  };

  it("displays totalPoints as the sum of problem points without inflation", () => {
    render(<AssignmentOverview {...baseProps} />);

    // totalPoints should be 450 (100+200+150), not 550 (old bug: +100 initial value)
    expect(screen.getAllByText("Points: 450").length).toBeGreaterThan(0);
  });

  it("uses DEFAULT_PROBLEM_POINTS when a problem has null points", () => {
    const problemsWithNull = [
      { id: "p1", sortOrder: 0, points: null, problem: { id: "p1", title: "Problem A" } },
    ];
    const expectedTotal = DEFAULT_PROBLEM_POINTS; // 100 default

    render(
      <AssignmentOverview
        {...baseProps}
        sortedProblems={problemsWithNull}
        totalPoints={expectedTotal}
      />
    );

    // The table row should display the default point value
    expect(screen.getByText(String(DEFAULT_PROBLEM_POINTS))).toBeInTheDocument();
    // totalPoints should equal DEFAULT_PROBLEM_POINTS
    expect(screen.getAllByText(`Points: ${DEFAULT_PROBLEM_POINTS}`).length).toBeGreaterThan(0);
  });

  it("displays exam duration for windowed exams", () => {
    render(<AssignmentOverview {...baseProps} />);

    expect(screen.getByText("120 min")).toBeInTheDocument();
  });

  it("totalPoints is 0 for empty problem list", () => {
    render(
      <AssignmentOverview
        {...baseProps}
        sortedProblems={[]}
        totalPoints={0}
      />
    );

    expect(screen.getAllByText("Points: 0").length).toBeGreaterThan(0);
  });

  it("back button returns through history, falling back to backHref (never the page itself)", () => {
    Object.defineProperty(window.history, "length", { configurable: true, get: () => 3 });
    try {
      render(<AssignmentOverview {...baseProps} />);

      const backButton = screen.getByRole("button", { name: "Back" });
      expect(backButton.closest("a")).toHaveAttribute("href", "/contests");

      fireEvent.click(backButton);
      expect(backMock).toHaveBeenCalledTimes(1);
    } finally {
      Reflect.deleteProperty(window.history, "length");
    }
  });
});
