import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { typescriptAdapter } from "@/lib/judge/function-judging/adapters/typescript";
import type { FunctionSpec } from "@/lib/judge/function-judging/types";

const spec: FunctionSpec = {
  functionName: "twoSum",
  params: [{ name: "nums", type: "int[]" }, { name: "target", type: "int" }],
  returnType: "int[]",
  enabledLanguages: ["typescript"],
};

const CORRECT_TWO_SUM = `function twoSum(nums: number[], target: number): number[] {
  const seen = new Map<number, number>();
  for (let i = 0; i < nums.length; i++) {
    const need = target - nums[i];
    if (seen.has(need)) return [seen.get(need)!, i];
    seen.set(nums[i], i);
  }
  return [];
}
`;

describe("typescript adapter", () => {
  it("registers under the canonical typescript language id", () => {
    expect(typescriptAdapter.language).toBe("typescript");
  });

  it("generates a typed top-level function stub with the mapped signature", () => {
    const stub = typescriptAdapter.generateStub(spec);
    expect(stub).toContain(
      "function twoSum(nums: number[], target: number): number[] {",
    );
  });

  it("assemble wraps student code with a stdin-reading main calling the bare function", () => {
    const { source, preludeLineCount } = typescriptAdapter.assemble(spec, CORRECT_TWO_SUM);
    expect(source).toContain('require("fs").readFileSync(0, "utf8")');
    expect(source).toContain("(...__args)");
    expect(source).toContain("twoSum as");
    expect(source).toContain("JSON.stringify(__result)");
    // Empty prelude: hoisted student function is reachable from the appended main.
    expect(preludeLineCount).toBe(0);
    const lines = source.split("\n");
    expect(lines[preludeLineCount]).toContain("function twoSum");
  });

  it("assembles the canonical twoSum to the committed golden fixture", () => {
    const { source } = typescriptAdapter.assemble(spec, CORRECT_TWO_SUM);
    const golden = readFileSync(
      join(__dirname, "..", "golden", "typescript-twoSum.ts"),
      "utf8",
    );
    expect(source).toBe(golden);
  });
});
