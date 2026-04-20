import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { PublicProblemSetList } from "@/components/problem/public-problem-set-list";
import { PublicProblemSetDetail } from "@/components/problem/public-problem-set-detail";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));

describe("public problem set pages", () => {
  it("renders a public problem set list card", () => {
    render(
      <PublicProblemSetList
        title="Problem Sets"
        description="Browse curated sets"
        emptyLabel="Empty"
        openLabel="Open set"
        locale="en"
        items={[
          {
            id: "set-1",
            href: "/practice/sets/set-1",
            name: "DP Warmup",
            description: "starter set",
            creatorName: "Alice",
            publicProblemCountLabel: "3 problems",
            tags: [{ name: "dp", color: null }, { name: "math", color: null }],
          },
        ]}
      />
    );

    expect(screen.getByText("Problem Sets")).toBeInTheDocument();
    expect(screen.getByText("DP Warmup")).toBeInTheDocument();
    expect(screen.getByText("3 problems")).toBeInTheDocument();
    expect(screen.getByText("dp")).toBeInTheDocument();
    expect(screen.getByText("math")).toBeInTheDocument();
  });

  it("renders a public problem set detail with solve-next CTA", () => {
    render(
      <PublicProblemSetDetail
        backHref="/practice/sets"
        backLabel="Back"
        title="DP Warmup"
        description="starter set"
        creatorLabel="Alice"
        publicProblemCountLabel="3 problems"
        problemsTitle="Problems"
        noProblemsLabel="No problems"
        solveNextHref="/practice/problems/problem-1"
        solveNextLabel="Solve next"
        solvedLabel="Solved"
        openLabel="Open"
        locale="en"
        problems={[
          {
            id: "problem-1",
            href: "/practice/problems/problem-1",
            title: "A + B",
            difficultyLabel: "Bronze V",
            solvedByViewer: true,
          },
        ]}
      />
    );

    expect(screen.getByText("DP Warmup")).toBeInTheDocument();
    expect(screen.getByText("Solve next")).toBeInTheDocument();
    expect(screen.getByText("A + B")).toBeInTheDocument();
    expect(screen.getByText("Bronze V")).toBeInTheDocument();
  });
});
