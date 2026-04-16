import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { UserStatsDashboard } from "@/components/user/user-stats-dashboard";

describe("UserStatsDashboard", () => {
  it("renders difficulty, category, language, and activity sections", () => {
    render(
      <UserStatsDashboard
        title="Activity"
        difficultyTitle="Difficulty Breakdown"
        categoryTitle="Category Breakdown"
        languageTitle="Language Breakdown"
        activityTitle="Activity"
        emptyLabel="No stats"
        tierStats={[{ label: "Bronze V", tier: "bronze", count: 3 }]}
        categoryStats={[{ label: "DP", count: 4 }]}
        languageStats={[{ label: "Python", count: 6 }]}
        activityDays={[
          { date: "2026-04-01", count: 0 },
          { date: "2026-04-02", count: 2 },
        ]}
      />
    );

    expect(screen.getByText("Difficulty Breakdown")).toBeInTheDocument();
    expect(screen.getByText("Bronze V")).toBeInTheDocument();
    expect(screen.getByText("DP")).toBeInTheDocument();
    expect(screen.getByText("Python")).toBeInTheDocument();
  });
});
