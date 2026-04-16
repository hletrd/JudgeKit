import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { PublicProblemDetail } from "@/app/(public)/_components/public-problem-detail";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));

vi.mock("@/components/problem-description", () => ({
  ProblemDescription: ({ description }: { description: string | null }) => <div>{description}</div>,
}));

describe("PublicProblemDetail", () => {
  it("renders problem metadata and action links", () => {
    render(
      <PublicProblemDetail
        backHref="/practice"
        backLabel="Back"
        title="A + B"
        description="Add two integers."
        authorLabel="Author: JudgeKit"
        tags={[{ name: "math", color: null }]}
        timeLimitLabel="Time Limit: 2000 ms"
        memoryLimitLabel="Memory Limit: 256 MB"
        difficultyTier={{ tier: "bronze", label: "Bronze V" }}
        difficultyLabel="1"
        playgroundHref="/playground"
        playgroundLabel="Try in playground"
        signInHref="/login"
        signInLabel="Sign in to submit"
      />
    );

    expect(screen.getByText("A + B")).toBeInTheDocument();
    expect(screen.getByText("Back")).toBeInTheDocument();
    expect(screen.getByText("Author: JudgeKit")).toBeInTheDocument();
    expect(screen.getByText("Time Limit: 2000 ms")).toBeInTheDocument();
    expect(screen.getByText("Memory Limit: 256 MB")).toBeInTheDocument();
    expect(screen.getByText("Bronze V")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("Try in playground")).toBeInTheDocument();
    expect(screen.getByText("Sign in to submit")).toBeInTheDocument();
  });
});
