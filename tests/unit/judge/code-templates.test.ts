import { describe, expect, it } from "vitest";
import { DEFAULT_TEMPLATES, getStarterCode, isTemplateLike } from "@/lib/judge/code-templates";
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

  it("falls back to DEFAULT_TEMPLATES for a function problem in an UNSUPPORTED language", () => {
    // rust is not a function-judging language → normal template.
    const code = getStarterCode({ problemType: "function", functionSpec: twoSum, language: "rust" });
    expect(code).toBe(DEFAULT_TEMPLATES.rust);
  });

  it("falls back to DEFAULT_TEMPLATES when problemType is not 'function'", () => {
    const code = getStarterCode({ problemType: "auto", functionSpec: twoSum, language: "python" });
    expect(code).toBe(DEFAULT_TEMPLATES.python);
  });

  it("falls back to DEFAULT_TEMPLATES when no spec is present", () => {
    const code = getStarterCode({ problemType: "function", functionSpec: null, language: "python" });
    expect(code).toBe(DEFAULT_TEMPLATES.python);
  });

  it("returns empty string for an unknown language with no template", () => {
    expect(getStarterCode({ problemType: "auto", functionSpec: null, language: "no-such-lang" })).toBe("");
  });

  it("does not throw and falls back when the spec is malformed for stub generation", () => {
    // An invalid spec object that the adapter may reject — must not throw.
    const bad = { functionName: "f", params: [], returnType: "int", enabledLanguages: [] } as unknown as FunctionSpec;
    expect(() => getStarterCode({ problemType: "function", functionSpec: bad, language: "python" })).not.toThrow();
  });
});

describe("isTemplateLike", () => {
  it("treats empty/whitespace as template-like", () => {
    expect(isTemplateLike("")).toBe(true);
    expect(isTemplateLike("   \n  ")).toBe(true);
  });

  it("treats a DEFAULT_TEMPLATES entry as template-like", () => {
    expect(isTemplateLike(DEFAULT_TEMPLATES.python)).toBe(true);
  });

  it("treats a function adapter stub as template-like when a spec is supplied", () => {
    const pyStub = getAdapter("python").generateStub(twoSum);
    const cppStub = getAdapter("cpp23").generateStub(twoSum);
    // Without a spec it is NOT recognized as template-like (it is user-looking code).
    expect(isTemplateLike(pyStub)).toBe(false);
    // With the spec, any supported-language stub is template-like.
    expect(isTemplateLike(pyStub, twoSum)).toBe(true);
    expect(isTemplateLike(cppStub, twoSum)).toBe(true);
  });

  it("treats real student code as NOT template-like even with a spec", () => {
    expect(isTemplateLike("class Solution:\n    def twoSum(self, nums, target):\n        return [0, 1]\n", twoSum)).toBe(false);
  });
});
