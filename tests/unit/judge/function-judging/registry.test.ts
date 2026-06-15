import { describe, expect, it } from "vitest";
import { getAdapter, supportsFunctionJudging, FUNCTION_JUDGING_LANGUAGES } from "@/lib/judge/function-judging/registry";

describe("function-judging registry", () => {
  it("registers exactly the implemented v1 languages", () => {
    // Only python, cpp23, and javascript are implemented so far. A follow-up
    // dispatch extends this to the full 7-language set.
    expect([...FUNCTION_JUDGING_LANGUAGES].sort()).toEqual(
      ["cpp23", "javascript", "python"].sort(),
    );
  });
  it("supportsFunctionJudging gates by registry", () => {
    expect(supportsFunctionJudging("python")).toBe(true);
    expect(supportsFunctionJudging("cpp23")).toBe(true);
    expect(supportsFunctionJudging("javascript")).toBe(true);
    expect(supportsFunctionJudging("brainfuck")).toBe(false);
  });
  it("getAdapter returns an adapter exposing generateStub + assemble", () => {
    const a = getAdapter("python");
    expect(typeof a.generateStub).toBe("function");
    expect(typeof a.assemble).toBe("function");
  });
  it("getAdapter throws for an unregistered language", () => {
    expect(() => getAdapter("brainfuck")).toThrow();
  });
});
