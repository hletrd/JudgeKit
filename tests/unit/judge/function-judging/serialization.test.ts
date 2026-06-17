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

  // AGG-4 / CF-3 — single-line stdin contract: encodeArgs output must never
  // contain a raw newline (each harness reads exactly one stdin line).
  it("keeps adversarial string args on a single line and round-trips them", () => {
    const corpus = [
      "comma,sep",
      'has"quote',
      "back\\slash",
      "line\nbreak",
      "carriage\rreturn",
      "tab\there",
      "café 你好 \u{1f600}",
    ];
    for (const s of corpus) {
      const encoded = encodeArgs([s], [{ name: "s", type: "string" }]);
      expect(encoded.includes("\n")).toBe(false);
      expect(encoded.includes("\r")).toBe(false);
      // The harness parses the whole line as JSON and spreads it as args.
      expect(JSON.parse(encoded)).toEqual([s]);
    }
  });

  it("keeps a string[] arg with newlines/commas on a single line", () => {
    const arr = ["a,b", "x\"y", "l\nm", "你好"];
    const encoded = encodeArgs([arr], [{ name: "xs", type: "string[]" }]);
    expect(encoded.includes("\n")).toBe(false);
    expect(JSON.parse(encoded)).toEqual([arr]);
  });
});
