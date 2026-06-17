import { describe, expect, it } from "vitest";
import { encodeValue } from "@/lib/judge/function-judging/serialization";
import { parseFieldValue, formatValue, decodeFieldValue } from "@/lib/judge/function-judging/value-fields";
import { isFloatComparedReturn } from "@/lib/judge/function-judging/comparison";

describe("value-fields parseFieldValue", () => {
  describe("int/long safe-integer guard (H2)", () => {
    it("accepts a scalar int at the safe-integer boundary", () => {
      const r = parseFieldValue("9007199254740991", "int");
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value).toBe(9007199254740991);
    });

    it("rejects a scalar int beyond the safe-integer range with a clear error", () => {
      const r = parseFieldValue("9007199254740993", "int");
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errorKey).toBe("fnValueIntOutOfRange");
    });

    it("rejects a negative long beyond the safe-integer range", () => {
      const r = parseFieldValue("-9007199254740993", "long");
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errorKey).toBe("fnValueIntOutOfRange");
    });

    it("rejects an int[] element beyond the safe-integer range", () => {
      const r = parseFieldValue("1, 9007199254740993, 3", "int[]");
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errorKey).toBe("fnValueArrayIntOutOfRange");
    });

    it("accepts an int[] whose elements are all within range", () => {
      const r = parseFieldValue("1, 2, 9007199254740991", "int[]");
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value).toEqual([1, 2, 9007199254740991]);
    });
  });

  describe("array authoring parse (M1)", () => {
    it("still parses bare comma-separated int[] input", () => {
      const r = parseFieldValue("2, 7, 11, 15", "int[]");
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value).toEqual([2, 7, 11, 15]);
    });

    it("parses an empty array field as []", () => {
      const r = parseFieldValue("", "int[]");
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value).toEqual([]);
    });

    it("round-trips a string[] element that contains a comma", () => {
      // Author enters a JSON array so commas inside elements are preserved.
      const r = parseFieldValue('["a,b", "c"]', "string[]");
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.value).toEqual(["a,b", "c"]);
        // Canonical serialization keeps both elements intact (no splitting).
        expect(encodeValue(r.value, "string[]")).toBe('["a,b","c"]');
      }
    });

    it("formats a string[] back to JSON so it round-trips through parse", () => {
      const text = formatValue(["a,b", "c"], "string[]");
      const r = parseFieldValue(text, "string[]");
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value).toEqual(["a,b", "c"]);
    });

    it("yields a clear error on malformed string[] JSON input", () => {
      const r = parseFieldValue('["a", "b"', "string[]");
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errorKey).toBe("fnValueInvalidArrayString");
    });

    it("rejects bare comma input for string[] (JSON required)", () => {
      const r = parseFieldValue("a,b", "string[]");
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errorKey).toBe("fnValueInvalidArrayString");
    });

    it("accepts a JSON array for int[] too", () => {
      const r = parseFieldValue("[2, 7, 11]", "int[]");
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value).toEqual([2, 7, 11]);
    });
  });

  describe("double authoring (v1.1)", () => {
    it("accepts a finite double scalar", () => {
      const r = parseFieldValue("0.5", "double");
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value).toBe(0.5);
    });

    it("accepts a negative and small double scalar", () => {
      expect(parseFieldValue("-3", "double")).toEqual({ ok: true, value: -3 });
      expect(parseFieldValue("1e-7", "double")).toEqual({ ok: true, value: 1e-7 });
    });

    it("accepts a finite double[] (bare comma form and JSON form)", () => {
      expect(parseFieldValue("0.5, 0.25, -3", "double[]")).toEqual({
        ok: true,
        value: [0.5, 0.25, -3],
      });
      expect(parseFieldValue("[0.5, 0.25, -3]", "double[]")).toEqual({
        ok: true,
        value: [0.5, 0.25, -3],
      });
    });

    it("rejects a non-finite double scalar (overflows to Infinity)", () => {
      const r = parseFieldValue("1e999", "double");
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errorKey).toBe("fnValueDoubleNotFinite");
    });

    it("rejects a non-finite double[] element (bare comma form)", () => {
      const r = parseFieldValue("0.5, 1e999, 3", "double[]");
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errorKey).toBe("fnValueArrayDoubleNotFinite");
    });

    it("rejects a non-finite double[] element (JSON form)", () => {
      const r = parseFieldValue("[0.5, 1e999, 3]", "double[]");
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errorKey).toBe("fnValueArrayDoubleNotFinite");
    });
  });
});

describe("decodeFieldValue", () => {
  it("decodes an empty string to an empty double[]", () => {
    expect(decodeFieldValue("", "double[]")).toEqual([]);
  });

  it("decodes a single double token", () => {
    expect(decodeFieldValue("0.5", "double[]")).toEqual([0.5]);
  });

  it("decodes multiple space-separated tokens", () => {
    expect(decodeFieldValue("0.5 0.25 -3", "double[]")).toEqual([0.5, 0.25, -3]);
  });

  it("handles varying whitespace between tokens", () => {
    expect(decodeFieldValue("0.5   0.25\t-3", "double[]")).toEqual([0.5, 0.25, -3]);
  });

  it("trims leading and trailing whitespace", () => {
    expect(decodeFieldValue("  0.5 0.25  ", "double[]")).toEqual([0.5, 0.25]);
  });

  it("throws on a non-finite token", () => {
    expect(() => decodeFieldValue("0.5 abc 3", "double[]")).toThrow();
  });

  it("passes through non-double types to decodeValue", () => {
    expect(decodeFieldValue("42", "int")).toBe(42);
    expect(decodeFieldValue('"hello"', "string")).toBe("hello");
    expect(decodeFieldValue("true", "bool")).toBe(true);
  });
});

describe("isFloatComparedReturn", () => {
  it("returns true for double scalar", () => {
    expect(isFloatComparedReturn("double")).toBe(true);
  });

  it("returns true for double[]", () => {
    expect(isFloatComparedReturn("double[]")).toBe(true);
  });

  it("returns false for non-double types", () => {
    expect(isFloatComparedReturn("int")).toBe(false);
    expect(isFloatComparedReturn("string[]")).toBe(false);
    expect(isFloatComparedReturn("bool")).toBe(false);
  });
});
