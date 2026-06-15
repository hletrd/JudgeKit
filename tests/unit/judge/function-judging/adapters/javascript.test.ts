import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { javascriptAdapter } from "@/lib/judge/function-judging/adapters/javascript";
import type { FunctionSpec } from "@/lib/judge/function-judging/types";

const spec: FunctionSpec = {
  functionName: "twoSum",
  params: [{ name: "nums", type: "int[]" }, { name: "target", type: "int" }],
  returnType: "int[]",
  enabledLanguages: ["javascript"],
};

const CORRECT_TWO_SUM = `function twoSum(nums, target) {
  const seen = new Map();
  for (let i = 0; i < nums.length; i++) {
    const need = target - nums[i];
    if (seen.has(need)) return [seen.get(need), i];
    seen.set(nums[i], i);
  }
  return [];
}
`;

describe("javascript adapter", () => {
  it("registers under the canonical javascript language id", () => {
    expect(javascriptAdapter.language).toBe("javascript");
  });

  it("generates a top-level function stub with the right signature", () => {
    const stub = javascriptAdapter.generateStub(spec);
    expect(stub).toContain("function twoSum(nums, target) {");
  });

  it("assemble wraps student code with a stdin-reading main calling the bare function", () => {
    const { source, preludeLineCount } = javascriptAdapter.assemble(spec, CORRECT_TWO_SUM);
    expect(source).toContain('require("fs").readFileSync(0, "utf8")');
    expect(source).toContain("twoSum(...__args)");
    expect(source).toContain("JSON.stringify(__result)");
    // Empty prelude: hoisted student function is reachable from the appended main.
    expect(preludeLineCount).toBe(0);
    const lines = source.split("\n");
    expect(lines[preludeLineCount]).toContain("function twoSum");
  });

  it("assembles the canonical twoSum to the committed golden fixture", () => {
    const { source } = javascriptAdapter.assemble(spec, CORRECT_TWO_SUM);
    const golden = readFileSync(
      join(__dirname, "..", "golden", "javascript-twoSum.js"),
      "utf8",
    );
    expect(source).toBe(golden);
  });
});
