import { describe, expect, it } from "vitest";
import { isFunctionType, parseFunctionSpec, SUPPORTED_FUNCTION_TYPES } from "@/lib/judge/function-judging/types";

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
});
