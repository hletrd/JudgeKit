import { describe, expect, it } from "vitest";
import { parseFieldValue } from "@/lib/judge/function-judging/value-fields";

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
});
