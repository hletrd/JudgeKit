import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("contest analytics timeline implementation", () => {
  it("requests timeline data from contest analytics computation", () => {
    const source = read("src/app/api/v1/contests/[assignmentId]/analytics/route.ts");

    expect(source).toContain("computeContestAnalytics(assignmentId, true)");
  });

  it("bounds the analytics submission scans (no unbounded all-rows fetch)", () => {
    const analytics = read("src/lib/assignments/contest-analytics.ts");
    // first-AC: one row per (user, problem) via DISTINCT ON, not every AC row
    expect(analytics).toContain("DISTINCT ON (s.user_id, s.problem_id)");
    // progression: keep only per-(user, problem) raw record-breakers via a window
    expect(analytics).toContain("MAX(s.score) OVER (");
    expect(analytics).toContain("WHERE prev_best IS NULL OR score > prev_best");
  });
});
