import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { PublicContestDetail } from "@/app/(public)/_components/public-contest-detail";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));

describe("PublicContestDetail", () => {
  it("renders contest overview and public problem links", () => {
    render(
      <PublicContestDetail
        backHref="/contests"
        backLabel="Back"
        title="Spring Challenge"
        description="Public overview"
        groupLabel="Hosted by Algorithms 101"
        statusLabel="Upcoming"
        modeLabel="Scheduled"
        scoringLabel="IOI"
        startsAtLabel="Starts: tomorrow"
        deadlineLabel="Deadline: next week"
        problemCountLabel="3 total problems"
        publicProblemCountLabel="2 public problems"
        publicProblemsTitle="Public problem set"
        noPublicProblemsLabel="No public problems"
        problemTitleLabel="Title"
        difficultyLabel="Difficulty"
        solverCountLabel="Solved by"
        successRateLabel="Success"
        actionLabel="Open problem"
        publicProblems={[{
          id: "problem-1",
          title: "A + B",
          href: "/practice/problems/problem-1",
          difficultyLabel: "1.00",
          solverCount: 42,
          successRateLabel: "84%",
        }]}
        finalRankingsTitle="Leaderboard"
        noFinalRankingsLabel="No entries"
        rankLabel="Rank"
        nameLabel="Name"
        totalScoreLabel="Score"
        penaltyLabel="Penalty"
        finalRankings={[{ userId: "user-1", name: "Alice", rank: 1, totalScoreLabel: "300", penaltyLabel: "42" }]}
        signInHref="/login"
        signInLabel="Sign in to join"
        dashboardHref="/dashboard"
        dashboardLabel="Open dashboard"
        overviewLabel="Overview"
      />
    );

    expect(screen.getByText("Spring Challenge")).toBeInTheDocument();
    expect(screen.getByText("Back")).toBeInTheDocument();
    expect(screen.getByText("Hosted by Algorithms 101")).toBeInTheDocument();
    expect(screen.getByText("Overview")).toBeInTheDocument();
    expect(screen.getByText("Public problem set")).toBeInTheDocument();
    expect(screen.getByText("A + B")).toBeInTheDocument();
    expect(screen.getByText("1.00")).toBeInTheDocument();
    expect(screen.getAllByText("42").length).toBeGreaterThan(0);
    expect(screen.getByText("84%")).toBeInTheDocument();
    expect(screen.getByText("Leaderboard")).toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getAllByText("Open problem").length).toBeGreaterThan(0);
    expect(screen.getByText("Sign in to join")).toBeInTheDocument();
  });
});
