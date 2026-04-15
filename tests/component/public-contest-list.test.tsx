import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { PublicContestList } from "@/app/(public)/_components/public-contest-list";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));

describe("PublicContestList", () => {
  it("renders public contests in a list layout", () => {
    render(
      <PublicContestList
        title="Public contest catalog"
        description="Browse public contests"
        noContestsLabel="No public contests"
        contests={[
          {
            id: "contest-1",
            title: "Spring Challenge",
            description: "A public contest.",
            groupName: "Algorithms 101",
            statusLabel: "Upcoming",
            statusKey: "upcoming",
            problemCountLabel: "3 total problems",
            publicProblemCountLabel: "2 public problems",
            modeLabel: "Scheduled",
            modeKey: "scheduled",
            scoringLabel: "IOI",
            scoringKey: "ioi",
            startsAtLabel: "Starts: Apr 16, 2026",
            deadlineLabel: "Deadline: Apr 17, 2026",
          },
        ]}
      />
    );

    expect(screen.getByText("Public contest catalog")).toBeInTheDocument();
    expect(screen.getByText("Spring Challenge")).toBeInTheDocument();
    expect(screen.getByText("Algorithms 101")).toBeInTheDocument();
    expect(screen.getByText("Upcoming")).toBeInTheDocument();
    expect(screen.getByText("Starts: Apr 16, 2026")).toBeInTheDocument();
    expect(screen.getByText("Deadline: Apr 17, 2026")).toBeInTheDocument();
  });
});
