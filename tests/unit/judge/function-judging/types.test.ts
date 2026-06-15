import { describe, expect, it } from "vitest";
import {
  AUTHORABLE_FUNCTION_TYPES,
  isFunctionType,
  parseFunctionSpec,
  SUPPORTED_FUNCTION_TYPES,
} from "@/lib/judge/function-judging/types";

describe("function-judging types", () => {
  it("accepts every supported scalar and 1-D array type", () => {
    for (const t of SUPPORTED_FUNCTION_TYPES) expect(isFunctionType(t)).toBe(true);
    expect(SUPPORTED_FUNCTION_TYPES).toContain("int");
    expect(SUPPORTED_FUNCTION_TYPES).toContain("string[]");
  });

  it("rejects unsupported types", () => {
    expect(isFunctionType("int[][]")).toBe(false);
    expect(isFunctionType("map")).toBe(false);
    expect(isFunctionType("void")).toBe(false); // non-void return required in v1
  });

  it("parses a valid spec", () => {
    const spec = parseFunctionSpec({
      functionName: "twoSum",
      params: [{ name: "nums", type: "int[]" }, { name: "target", type: "int" }],
      returnType: "int[]",
      enabledLanguages: ["python", "cpp"],
    });
    expect(spec.functionName).toBe("twoSum");
    expect(spec.params).toHaveLength(2);
  });

  it("rejects a spec with an invalid identifier or zero params", () => {
    expect(() => parseFunctionSpec({ functionName: "2bad", params: [{ name: "x", type: "int" }], returnType: "int", enabledLanguages: ["python"] })).toThrow();
    expect(() => parseFunctionSpec({ functionName: "f", params: [], returnType: "int", enabledLanguages: ["python"] })).toThrow();
  });

  it("excludes the deferred double / double[] types from the authorable set", () => {
    expect(AUTHORABLE_FUNCTION_TYPES).not.toContain("double");
    expect(AUTHORABLE_FUNCTION_TYPES).not.toContain("double[]");
    // Everything else (scalars + 1-D arrays) stays authorable.
    expect(AUTHORABLE_FUNCTION_TYPES).toContain("int");
    expect(AUTHORABLE_FUNCTION_TYPES).toContain("string[]");
    expect(AUTHORABLE_FUNCTION_TYPES).toHaveLength(SUPPORTED_FUNCTION_TYPES.length - 2);
  });

  it("rejects a spec with a double or double[] param/return (deferred to v1.1)", () => {
    expect(() => parseFunctionSpec({
      functionName: "f", params: [{ name: "x", type: "double" }], returnType: "int", enabledLanguages: ["python"],
    })).toThrow();
    expect(() => parseFunctionSpec({
      functionName: "f", params: [{ name: "x", type: "int" }], returnType: "double", enabledLanguages: ["python"],
    })).toThrow();
    expect(() => parseFunctionSpec({
      functionName: "f", params: [{ name: "x", type: "double[]" }], returnType: "int", enabledLanguages: ["python"],
    })).toThrow();
  });
});
