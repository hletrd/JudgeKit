import { describe, expect, it } from "vitest";
import {
  assembleFunctionSubmission,
  functionPreludeLineCount,
} from "@/lib/judge/function-judging/assemble";
import type { FunctionSpec } from "@/lib/judge/function-judging/types";

const spec: FunctionSpec = {
  functionName: "f",
  params: [{ name: "x", type: "int" }],
  returnType: "int",
  enabledLanguages: ["python"],
};

describe("assembleFunctionSubmission", () => {
  it("delegates to the language adapter and returns source + offset", () => {
    const r = assembleFunctionSubmission(
      spec,
      "python",
      "class Solution:\n    def f(self, x):\n        return x\n",
    );
    expect(r.source).toContain("Solution().f(*args)");
    expect(r.source).toContain("class Solution:");
    expect(r.preludeLineCount).toBeGreaterThan(0);
  });

  it("throws for an unsupported language", () => {
    expect(() => assembleFunctionSubmission(spec, "brainfuck", "x")).toThrow();
  });
});

describe("functionPreludeLineCount", () => {
  it("recomputes the prelude line count deterministically via empty assembly", () => {
    const direct = assembleFunctionSubmission(spec, "python", "").preludeLineCount;
    expect(functionPreludeLineCount(spec, "python")).toBe(direct);
    expect(functionPreludeLineCount(spec, "python")).toBeGreaterThan(0);
  });

  it("is independent of the student code length", () => {
    const empty = functionPreludeLineCount(spec, "python");
    const withCode = assembleFunctionSubmission(
      spec,
      "python",
      "class Solution:\n    def f(self, x):\n        return x\n",
    ).preludeLineCount;
    expect(empty).toBe(withCode);
  });

  it("throws for an unsupported language", () => {
    expect(() => functionPreludeLineCount(spec, "brainfuck")).toThrow();
  });
});
