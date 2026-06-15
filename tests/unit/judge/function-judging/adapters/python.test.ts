import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { pythonAdapter } from "@/lib/judge/function-judging/adapters/python";
import type { FunctionSpec } from "@/lib/judge/function-judging/types";

const spec: FunctionSpec = {
  functionName: "twoSum",
  params: [{ name: "nums", type: "int[]" }, { name: "target", type: "int" }],
  returnType: "int[]",
  enabledLanguages: ["python"],
};

const CORRECT_TWO_SUM = `class Solution:
    def twoSum(self, nums, target):
        seen = {}
        for i, x in enumerate(nums):
            if target - x in seen:
                return [seen[target - x], i]
            seen[x] = i
        return []
`;

describe("python adapter", () => {
  it("generates a class-based stub with the right signature", () => {
    const stub = pythonAdapter.generateStub(spec);
    expect(stub).toContain("class Solution:");
    expect(stub).toContain("def twoSum(self, nums, target):");
    expect(stub).toContain("pass");
  });

  it("assemble wraps student code with a stdin-reading main and reports prelude lines", () => {
    const { source, preludeLineCount } = pythonAdapter.assemble(
      spec,
      "class Solution:\n    def twoSum(self, nums, target):\n        return [0, 1]\n",
    );
    expect(source).toContain("import sys, json");
    expect(source).toContain("Solution().twoSum(*args)");
    expect(preludeLineCount).toBeGreaterThan(0);
    // student code appears after exactly preludeLineCount prelude lines
    const lines = source.split("\n");
    expect(lines[preludeLineCount]).toContain("class Solution:");
  });

  it("assembles the canonical twoSum to the committed golden fixture", () => {
    const { source } = pythonAdapter.assemble(spec, CORRECT_TWO_SUM);
    const golden = readFileSync(
      join(__dirname, "..", "golden", "python-twoSum.py"),
      "utf8",
    );
    expect(source).toBe(golden);
  });
});
