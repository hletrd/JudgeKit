import { describe, expect, it } from "vitest";
import { getStarterCode, isTemplateLike } from "@/lib/judge/code-templates";
import { getAdapter } from "@/lib/judge/function-judging/registry";
import type { FunctionSpec } from "@/lib/judge/function-judging/types";

const twoSum: FunctionSpec = {
  functionName: "twoSum",
  params: [
    { name: "nums", type: "int[]" },
    { name: "target", type: "int" },
  ],
  returnType: "int[]",
  enabledLanguages: ["python", "cpp23", "javascript"],
};

const SAMPLE_STARTER = "#include <bits/stdc++.h>\nint main() { return 0; }";

describe("getStarterCode", () => {
  it("returns the adapter stub for a function problem in a supported language", () => {
    const code = getStarterCode({ problemType: "function", functionSpec: twoSum, language: "python" });
    expect(code).toBe(getAdapter("python").generateStub(twoSum));
    expect(code).toContain("twoSum");
  });

  it("returns the matching stub when the language changes (cpp23)", () => {
    const code = getStarterCode({ problemType: "function", functionSpec: twoSum, language: "cpp23" });
    expect(code).toBe(getAdapter("cpp23").generateStub(twoSum));
    expect(code).toContain("class Solution");
  });

  it("returns the configured starter for a function problem in an UNSUPPORTED language", () => {
    // rust is not a function-judging language → the configured starter (or blank).
    const code = getStarterCode({ problemType: "function", functionSpec: twoSum, language: "rust", starterCode: SAMPLE_STARTER });
    expect(code).toBe(SAMPLE_STARTER);
  });

  it("returns the configured starter when problemType is not 'function'", () => {
    const code = getStarterCode({ problemType: "auto", functionSpec: twoSum, language: "cpp", starterCode: SAMPLE_STARTER });
    expect(code).toBe(SAMPLE_STARTER);
  });

  it("returns the configured starter when no spec is present", () => {
    const code = getStarterCode({ problemType: "function", functionSpec: null, language: "cpp", starterCode: SAMPLE_STARTER });
    expect(code).toBe(SAMPLE_STARTER);
  });

  it("defaults to BLANK when no starter code is configured", () => {
    // The core requirement: no built-in fallback template. Unset → empty editor.
    expect(getStarterCode({ problemType: "auto", functionSpec: null, language: "cpp" })).toBe("");
    expect(getStarterCode({ problemType: "auto", functionSpec: null, language: "python", starterCode: null })).toBe("");
    expect(getStarterCode({ problemType: "auto", functionSpec: null, language: "no-such-lang" })).toBe("");
  });

  it("preserves configured starter whitespace/indentation verbatim", () => {
    const indented = "def solve():\n    x = 1\n    return x\n";
    expect(getStarterCode({ problemType: "auto", functionSpec: null, language: "python", starterCode: indented })).toBe(indented);
  });

  it("does not throw and falls back to the configured starter when the spec is malformed", () => {
    const bad = { functionName: "f", params: [], returnType: "int", enabledLanguages: [] } as unknown as FunctionSpec;
    expect(() =>
      getStarterCode({ problemType: "function", functionSpec: bad, language: "python", starterCode: SAMPLE_STARTER }),
    ).not.toThrow();
  });
});

describe("isTemplateLike", () => {
  it("treats empty/whitespace as template-like", () => {
    expect(isTemplateLike("")).toBe(true);
    expect(isTemplateLike("   \n  ")).toBe(true);
  });

  it("treats a configured starter (from knownStarters) as template-like", () => {
    // The configured starter must stay overwritable after a language switch.
    expect(isTemplateLike(SAMPLE_STARTER, null, [SAMPLE_STARTER])).toBe(true);
    // Not recognized without the known-starter set (looks like user code).
    expect(isTemplateLike(SAMPLE_STARTER)).toBe(false);
  });

  it("still recognizes legacy built-in boilerplate as template-like", () => {
    // Older sessions may have preloaded the built-in C++ boilerplate; it must
    // remain overwritable across the transition to blank defaults.
    const legacyCpp = `#include <bits/stdc++.h>\nusing namespace std;\n\nint main(void) {\n    ios_base::sync_with_stdio(false);\n    cin.tie(nullptr);\n\n    return 0;\n}`;
    expect(isTemplateLike(legacyCpp)).toBe(true);
  });

  it("treats a function adapter stub as template-like when a spec is supplied", () => {
    const pyStub = getAdapter("python").generateStub(twoSum);
    const cppStub = getAdapter("cpp23").generateStub(twoSum);
    expect(isTemplateLike(pyStub)).toBe(false);
    expect(isTemplateLike(pyStub, twoSum)).toBe(true);
    expect(isTemplateLike(cppStub, twoSum)).toBe(true);
  });

  it("treats real student code as NOT template-like", () => {
    expect(isTemplateLike("class Solution:\n    def twoSum(self, nums, target):\n        return [0, 1]\n", twoSum)).toBe(false);
    expect(isTemplateLike("print('hello world')", null, [SAMPLE_STARTER])).toBe(false);
  });
});
