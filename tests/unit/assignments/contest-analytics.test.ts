import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  computeContestRankingMock,
  rawQueryAllMock,
  rawQueryOneMock,
} = vi.hoisted(() => ({
  computeContestRankingMock: vi.fn(),
  rawQueryAllMock: vi.fn(),
  rawQueryOneMock: vi.fn(),
}));

vi.mock("@/lib/assignments/contest-scoring", () => ({
  computeContestRanking: computeContestRankingMock,
}));

vi.mock("@/lib/db/queries", () => ({
  rawQueryAll: rawQueryAllMock,
  rawQueryOne: rawQueryOneMock,
}));

import { computeContestAnalytics } from "@/lib/assignments/contest-analytics";

describe("computeContestAnalytics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("treats non-finite leaderboard scores as zero instead of crashing histogram generation", async () => {
    computeContestRankingMock.mockResolvedValue({
      entries: [
        {
          userId: "user-1",
          username: "alice",
          name: "Alice",
          className: null,
          rank: 1,
          totalScore: Number.NaN,
          totalPenalty: 0,
          problems: [],
        },
      ],
    });

    rawQueryAllMock
      .mockResolvedValueOnce([{ problemId: "problem-1", title: "Problem 1", points: 100 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    rawQueryOneMock.mockResolvedValue({ startsAt: new Date("2026-01-01T00:00:00Z") });

    const analytics = await computeContestAnalytics("assignment-1");

    expect(analytics.scoreDistribution[0].count).toBe(1);
    expect(analytics.problemSolveRates).toHaveLength(1);
  });
});
