import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { PublicProblemList } from "@/app/(public)/_components/public-problem-list";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));

describe("PublicProblemList", () => {
  it("renders public problem rows in a list/table layout", () => {
    render(
      <PublicProblemList
        title="Public problem catalog"
        description="Browse public problems"
        noProblemsLabel="No public problems"
        numberLabel="#"
        problemTitleLabel="Title"
        difficultyLabel="Difficulty"
        tagLabel="Tags"
        solverCountLabel="Solved by"
        successRateLabel="Success"
        createdAtLabel="Added"
        progressLabel="Progress"
        progressLabels={{ solved: "Solved", attempted: "Attempted", untried: "Untried" }}
        locale="en"
        problems={[
          {
            id: "problem-1",
            href: "/practice/problems/problem-1",
            sequenceNumber: 1000,
            title: "A + B",
            difficultyLabel: "1.00",
            difficultyTier: { tier: "bronze", label: "Bronze V" },
            searchMatchLabels: ["Title match", "Content match"],
            tags: [{ name: "math", color: null, href: "/practice?tag=math" }],
            solverCount: 42,
            submissionCount: 100,
            successRate: 42.0,
            progress: "solved",
            createdAt: "Jan 1, 2026",
          },
        ]}
      />
    );

    expect(screen.getByText("Public problem catalog")).toBeInTheDocument();
    expect(screen.getByText("A + B")).toBeInTheDocument();
    expect(screen.getByText("1000")).toBeInTheDocument();
    expect(screen.getByText("1.00")).toBeInTheDocument();
    expect(screen.getByText("Bronze V")).toBeInTheDocument();
    expect(screen.getByText("Title match")).toBeInTheDocument();
    expect(screen.getByText("Content match")).toBeInTheDocument();
    expect(screen.getByText("math")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("42.0%")).toBeInTheDocument();
    expect(screen.getByText("Jan 1, 2026")).toBeInTheDocument();
  });

  it("shows dashes when no submission data", () => {
    render(
      <PublicProblemList
        title="Catalog"
        description="Browse"
        noProblemsLabel="None"
        numberLabel="#"
        problemTitleLabel="Title"
        difficultyLabel="Difficulty"
        tagLabel="Tags"
        solverCountLabel="Solved by"
        successRateLabel="Success"
        createdAtLabel="Added"
        progressLabel="Progress"
        progressLabels={{ solved: "Solved", attempted: "Attempted", untried: "Untried" }}
        locale="en"
        problems={[
          {
            id: "problem-2",
            href: "/practice/problems/problem-2",
            sequenceNumber: null,
            title: "Empty problem",
            difficultyLabel: null,
            difficultyTier: null,
            searchMatchLabels: [],
            tags: [],
            solverCount: 0,
            submissionCount: 0,
            successRate: null,
            progress: null,
            createdAt: null,
          },
        ]}
      />
    );

    const dashes = screen.getAllByText("-");
    expect(dashes.length).toBeGreaterThanOrEqual(3); // solver, rate, difficulty, date
  });
});
