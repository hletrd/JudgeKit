import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("practice success-rate query implementation", () => {
  it("keeps success-rate ordering in SQL instead of sorting the full catalog in memory", () => {
    const source = read("src/app/(public)/practice/page.tsx");

    expect(source).toContain('const submissionStatsSubquery = db');
    expect(source).toContain('sql<number>`count(*)`.as("submissionCount")');
    expect(source).toContain('.as("solverCount")');
    expect(source).toContain('.as("acceptedCount")');
    expect(source).toContain(".leftJoin(submissionStatsSubquery");
    expect(source).toContain("coalesce(cast(${submissionStatsSubquery.acceptedCount} as double precision)");
    expect(source).not.toContain("withRate.sort(");
  });
});
