import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { goAdapter } from "@/lib/judge/function-judging/adapters/go";
import type { FunctionSpec } from "@/lib/judge/function-judging/types";

const spec: FunctionSpec = {
  functionName: "twoSum",
  params: [{ name: "nums", type: "int[]" }, { name: "target", type: "int" }],
  returnType: "int[]",
  enabledLanguages: ["go"],
};

const CORRECT_TWO_SUM = `func twoSum(nums []int64, target int64) []int64 {
	seen := map[int64]int64{}
	for i, x := range nums {
		if j, ok := seen[target-x]; ok {
			return []int64{j, int64(i)}
		}
		seen[x] = int64(i)
	}
	return []int64{}
}
`;

describe("go adapter", () => {
  it("registers under the canonical go language id", () => {
    expect(goAdapter.language).toBe("go");
  });

  it("generates a func stub with the Go-mapped signature", () => {
    const stub = goAdapter.generateStub(spec);
    expect(stub).toContain("func twoSum(nums []int64, target int64) []int64 {");
  });

  it("assemble emits package main, a json-decoding main, and the call", () => {
    const { source, preludeLineCount } = goAdapter.assemble(spec, CORRECT_TWO_SUM);
    expect(source).toContain("package main");
    expect(source).toContain("encoding/json");
    expect(source).toContain("func main()");
    expect(source).toContain("twoSum(");
    expect(preludeLineCount).toBeGreaterThan(0);
    const lines = source.split("\n");
    expect(lines[preludeLineCount]).toContain("func twoSum");
  });

  it("assembles the canonical twoSum to the committed golden fixture", () => {
    const { source } = goAdapter.assemble(spec, CORRECT_TWO_SUM);
    const golden = readFileSync(
      join(__dirname, "..", "golden", "go-twoSum.go"),
      "utf8",
    );
    expect(source).toBe(golden);
  });
});
