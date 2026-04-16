import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("public contest detail archive implementation", () => {
  it("loads archive analytics and leaderboard data for finished public contests", () => {
    const source = read("src/app/(public)/contests/[id]/page.tsx");

    expect(source).toContain("computeContestAnalytics");
    expect(source).toContain("computeLeaderboard(contest.id, true)");
    expect(source).toContain("const showArchiveInsights = contest.status === \"expired\" || contest.status === \"closed\"");
  });
});
