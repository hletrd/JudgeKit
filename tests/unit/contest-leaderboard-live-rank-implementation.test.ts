import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("contest leaderboard live rank implementation", () => {
  it("shows a live-rank badge for the current user on frozen leaderboards", () => {
    const source = read("src/components/contest/leaderboard-table.tsx");

    expect(source).toContain('entry.liveRank != null');
    expect(source).toContain('t("liveRank", { rank: entry.liveRank })');
    expect(source).toContain('t("live")');
  });
});
