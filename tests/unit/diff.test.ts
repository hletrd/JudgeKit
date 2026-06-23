import { describe, expect, it } from "vitest";
import {
  canComputeRichDiff,
  computeDiff,
  MAX_RICH_DIFF_CELLS,
  MAX_RICH_DIFF_CHARS,
} from "@/lib/diff";

describe("diff helpers", () => {
  it("computes small line diffs", () => {
    const diff = computeDiff("a\nb\n", "a\nc\n");

    expect(diff.map((line) => line.kind)).toEqual(["equal", "remove", "add", "equal"]);
  });

  it("rejects text above the rich diff character budget", () => {
    const expected = "a".repeat(MAX_RICH_DIFF_CHARS);
    const actual = "b";

    expect(canComputeRichDiff(expected, actual)).toBe(false);
    expect(() => computeDiff(expected, actual)).toThrow("diffTooLarge");
  });

  it("rejects line counts that would allocate an oversized LCS table", () => {
    const side = Math.floor(Math.sqrt(MAX_RICH_DIFF_CELLS)) + 1;
    const expected = Array.from({ length: side }, (_, index) => `e${index}`).join("\n");
    const actual = Array.from({ length: side }, (_, index) => `a${index}`).join("\n");

    expect(expected.length + actual.length).toBeLessThan(MAX_RICH_DIFF_CHARS);
    expect(canComputeRichDiff(expected, actual)).toBe(false);
  });
});
