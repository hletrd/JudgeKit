import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("practice difficulty range implementation", () => {
  it("threads the difficulty filter through the public practice page query, UI, and pagination", () => {
    const source = read("src/app/(public)/practice/page.tsx");

    expect(source).toContain("DifficultyRangeFilter");
    expect(source).toContain("normalizeDifficultyRange");
    expect(source).toContain("serializeDifficultyRange");
    expect(source).toContain("gte(problems.difficulty, currentDifficultyRange.min)");
    expect(source).toContain("lte(problems.difficulty, currentDifficultyRange.max)");
    expect(source).toContain('name="difficulty"');
    expect(source).toContain('t("practice.difficultyRange")');
  });
});
