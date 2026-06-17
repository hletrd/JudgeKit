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

  // double / double[] returns are printed as whitespace-separated numeric
  // tokens (NOT JSON) so the worker's whitespace-token float comparator can
  // tokenize them. A scalar is one token; an array is space-separated tokens.
  it("encodes a double scalar as a single numeric token (no brackets)", () => {
    expect(encodeValue(0.5, "double")).toBe("0.5");
    expect(encodeValue(-3, "double")).toBe("-3");
    expect(encodeValue(7, "double")).toBe("7");
  });
  it("encodes a double[] as space-separated tokens (no brackets/commas)", () => {
    expect(encodeValue([0.5, 0.25, -3], "double[]")).toBe("0.5 0.25 -3");
    expect(encodeValue([], "double[]")).toBe("");
    expect(encodeValue([1e-7], "double[]")).toBe("1e-7");
  });
  it("encodes an argument vector as one JSON line", () => {
    expect(encodeArgs([[2, 7, 11, 15], 9], [
      { name: "nums", type: "int[]" }, { name: "target", type: "int" },
    ])).toBe("[[2,7,11,15],9]");
  });

  // PARAMS (stdin) stay canonical JSON for every type INCLUDING double — only
  // the RETURN print format changes for double. The harnesses read params as
  // JSON numbers exactly as before.
  it("encodes double params as JSON numbers on the stdin line", () => {
    expect(encodeArgs([0.5, [0.25, -3]], [
      { name: "x", type: "double" }, { name: "ys", type: "double[]" },
    ])).toBe("[0.5,[0.25,-3]]");
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
