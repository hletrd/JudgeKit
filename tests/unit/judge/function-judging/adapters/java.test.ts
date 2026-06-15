import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { javaAdapter } from "@/lib/judge/function-judging/adapters/java";
import type { FunctionSpec } from "@/lib/judge/function-judging/types";

const spec: FunctionSpec = {
  functionName: "twoSum",
  params: [{ name: "nums", type: "int[]" }, { name: "target", type: "int" }],
  returnType: "int[]",
  enabledLanguages: ["java"],
};

const CORRECT_TWO_SUM = `class Solution {
    long[] twoSum(long[] nums, long target) {
        java.util.HashMap<Long, Integer> seen = new java.util.HashMap<>();
        for (int i = 0; i < nums.length; i++) {
            long need = target - nums[i];
            if (seen.containsKey(need)) return new long[]{seen.get(need), i};
            seen.put(nums[i], i);
        }
        return new long[]{};
    }
}
`;

describe("java adapter", () => {
  it("registers under the canonical java language id", () => {
    expect(javaAdapter.language).toBe("java");
  });

  it("generates a Solution class with the Java-mapped signature", () => {
    const stub = javaAdapter.generateStub(spec);
    expect(stub).toContain("class Solution");
    expect(stub).toContain("long[] twoSum(long[] nums, long target)");
  });

  it("assemble emits the public Main entry, the json reader, and a call into Solution", () => {
    const { source, preludeLineCount } = javaAdapter.assemble(spec, CORRECT_TWO_SUM);
    // The worker copies solution.java -> Main.java and runs class Main, so the
    // single public top-level class MUST be Main.
    expect(source).toContain("public class Main");
    expect(source).toContain("public static void main(String[] args)");
    expect(source).toContain("new Solution().twoSum(");
    expect(preludeLineCount).toBeGreaterThan(0);
    const lines = source.split("\n");
    expect(lines[preludeLineCount]).toContain("class Solution");
  });

  it("assembles the canonical twoSum to the committed golden fixture", () => {
    const { source } = javaAdapter.assemble(spec, CORRECT_TWO_SUM);
    const golden = readFileSync(
      join(__dirname, "..", "golden", "java-twoSum.java"),
      "utf8",
    );
    expect(source).toBe(golden);
  });
});
