import { describe, expect, it } from "vitest";
import { encodeValue, encodeArgs, decodeValue } from "@/lib/judge/function-judging/serialization";

describe("function-judging serialization", () => {
  it("encodes scalars compactly", () => {
    expect(encodeValue(5, "int")).toBe("5");
    expect(encodeValue(true, "bool")).toBe("true");
    expect(encodeValue("a,b", "string")).toBe('"a,b"');
  });
  it("encodes 1-D arrays without inner spaces", () => {
    expect(encodeValue([2, 7, 11], "int[]")).toBe("[2,7,11]");
    expect(encodeValue(["x", "y"], "string[]")).toBe('["x","y"]');
  });
  it("encodes an argument vector as one JSON line", () => {
    expect(encodeArgs([[2, 7, 11, 15], 9], [
      { name: "nums", type: "int[]" }, { name: "target", type: "int" },
    ])).toBe("[[2,7,11,15],9]");
  });
  it("round-trips through decode", () => {
    expect(decodeValue("[1,2,3]", "int[]")).toEqual([1, 2, 3]);
    expect(decodeValue("true", "bool")).toBe(true);
  });
});
