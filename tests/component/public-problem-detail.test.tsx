import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { PublicProblemDetail } from "@/app/(public)/_components/public-problem-detail";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));

vi.mock("@/components/problem/structured-problem-statement", () => ({
  StructuredProblemStatement: ({ description }: { description: string | null }) => <div>{description}</div>,
}));

describe("PublicProblemDetail", () => {
  it("renders problem metadata without a built-in playground link", () => {
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
      />
    );

    expect(screen.getByText("A + B")).toBeInTheDocument();
    expect(screen.getByText("Back")).toBeInTheDocument();
    expect(screen.getByText("Author: JudgeKit")).toBeInTheDocument();
    expect(screen.getByText("Time Limit: 2000 ms")).toBeInTheDocument();
    expect(screen.getByText("Memory Limit: 256 MB")).toBeInTheDocument();
    expect(screen.getByText("Bronze V")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    // The playground link and sign-in fallback are no longer rendered here;
    // the caller owns the submit/sign-in affordance via submitAction.
    expect(screen.queryByText("Try in playground")).toBeNull();
  });

  it("renders the provided submit and edit actions", () => {
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
        submitAction={<button type="button">Quick submit</button>}
        editAction={<button type="button">Edit problem</button>}
      />
    );

    expect(screen.getByText("Quick submit")).toBeInTheDocument();
    expect(screen.getByText("Edit problem")).toBeInTheDocument();
  });
});
