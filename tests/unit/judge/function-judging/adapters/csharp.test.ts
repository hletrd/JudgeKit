import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { csharpAdapter } from "@/lib/judge/function-judging/adapters/csharp";
import type { FunctionSpec } from "@/lib/judge/function-judging/types";

const spec: FunctionSpec = {
  functionName: "twoSum",
  params: [{ name: "nums", type: "int[]" }, { name: "target", type: "int" }],
  returnType: "int[]",
  enabledLanguages: ["csharp"],
};

const CORRECT_TWO_SUM = `class Solution {
    public long[] twoSum(long[] nums, long target) {
        var seen = new System.Collections.Generic.Dictionary<long, long>();
        for (int i = 0; i < nums.Length; i++) {
            long need = target - nums[i];
            if (seen.ContainsKey(need)) return new long[] { seen[need], i };
            seen[nums[i]] = i;
        }
        return new long[] { };
    }
}
`;

describe("csharp adapter", () => {
  it("registers under the canonical csharp language id", () => {
    expect(csharpAdapter.language).toBe("csharp");
  });

  it("generates a Solution class with the C#-mapped signature", () => {
    const stub = csharpAdapter.generateStub(spec);
    expect(stub).toContain("class Solution");
    expect(stub).toContain("public long[] twoSum(long[] nums, long target)");
  });

  it("assemble emits a Main entry, the hand-written json reader, and the call", () => {
    const { source, preludeLineCount } = csharpAdapter.assemble(spec, CORRECT_TWO_SUM);
    expect(source).toContain("static void Main(");
    expect(source).toContain("new Solution().twoSum(");
    // No external assemblies: a hand-written reader, not System.Text.Json
    // (Mono 6.12's mcs references only mscorlib/System by default).
    expect(source).not.toContain("System.Text.Json");
    expect(preludeLineCount).toBeGreaterThan(0);
    const lines = source.split("\n");
    expect(lines[preludeLineCount]).toContain("class Solution");
  });

  it("assembles the canonical twoSum to the committed golden fixture", () => {
    const { source } = csharpAdapter.assemble(spec, CORRECT_TWO_SUM);
    const golden = readFileSync(
      join(__dirname, "..", "golden", "csharp-twoSum.cs"),
      "utf8",
    );
    expect(source).toBe(golden);
  });
});
