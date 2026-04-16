import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/queries", () => ({
  rawQueryAll: vi.fn(),
}));

vi.mock("@/lib/assignments/contest-scoring", () => ({
  computeContestRanking: vi.fn(),
}));

describe("sampleReplayCutoffs", () => {
  it("returns all unique sorted cutoffs when under the limit", async () => {
    const { sampleReplayCutoffs } = await import("@/lib/assignments/contest-replay");
    expect(sampleReplayCutoffs([30, 10, 20, 20], 10)).toEqual([10, 20, 30]);
  });

  it("samples evenly across a large cutoff set while keeping the endpoints", async () => {
    const { sampleReplayCutoffs } = await import("@/lib/assignments/contest-replay");
    const sampled = sampleReplayCutoffs([10, 20, 30, 40, 50, 60], 3);

    expect(sampled[0]).toBe(10);
    expect(sampled[sampled.length - 1]).toBe(60);
    expect(sampled).toHaveLength(3);
  });
});
