import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cppAdapter } from "@/lib/judge/function-judging/adapters/cpp";
import type { FunctionSpec } from "@/lib/judge/function-judging/types";

const spec: FunctionSpec = {
  functionName: "twoSum",
  params: [{ name: "nums", type: "int[]" }, { name: "target", type: "int" }],
  returnType: "int[]",
  enabledLanguages: ["cpp23"],
};

const CORRECT_TWO_SUM = `class Solution {
public:
    vector<long long> twoSum(vector<long long> nums, long long target) {
        unordered_map<long long, long long> seen;
        for (long long i = 0; i < (long long)nums.size(); i++) {
            long long need = target - nums[i];
            if (seen.count(need)) return {seen[need], i};
            seen[nums[i]] = i;
        }
        return {};
    }
};
`;

describe("cpp adapter", () => {
  it("registers under the canonical cpp23 language id", () => {
    expect(cppAdapter.language).toBe("cpp23");
  });

  it("generates a Solution class with the C++-mapped signature", () => {
    const stub = cppAdapter.generateStub(spec);
    expect(stub).toContain("class Solution");
    expect(stub).toContain(
      "std::vector<long long> twoSum(std::vector<long long> nums, long long target)",
    );
  });

  it("assemble emits the json prelude, the call, and a correct prelude offset", () => {
    const { source, preludeLineCount } = cppAdapter.assemble(spec, CORRECT_TWO_SUM);
    expect(source).toContain("namespace __fnjudge");
    expect(source).toContain("std::getline(std::cin, __line)");
    expect(source).toContain("Solution().twoSum(nums, target)");
    expect(preludeLineCount).toBeGreaterThan(0);
    const lines = source.split("\n");
    expect(lines[preludeLineCount]).toContain("class Solution");
  });

  it("consumes a comma between positional arguments", () => {
    const { source } = cppAdapter.assemble(spec, CORRECT_TWO_SUM);
    expect(source).toContain("__r.expect(',')");
  });

  it("assembles the canonical twoSum to the committed golden fixture", () => {
    const { source } = cppAdapter.assemble(spec, CORRECT_TWO_SUM);
    const golden = readFileSync(
      join(__dirname, "..", "golden", "cpp-twoSum.cpp"),
      "utf8",
    );
    expect(source).toBe(golden);
  });
});
