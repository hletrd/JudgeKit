import { describe, expect, it } from "vitest";
import { computeIcpcPenalty } from "@/lib/assignments/contest-scoring";
import { generateAccessCode } from "@/lib/assignments/access-codes";
import {
  normalizeSource,
  jaccardSimilarity,
} from "@/lib/assignments/code-similarity";

const ALLOWED_CHARS = new Set("ABCDEFGHJKLMNPQRSTUVWXYZ23456789".split(""));
const DISALLOWED_CHARS = ["I", "O", "0", "1"];

describe("computeIcpcPenalty", () => {
  it("returns only the time penalty when there are zero wrong attempts", () => {
    const contestStart = 0;
    const firstAc = 45 * 60_000; // 45 minutes in ms
    expect(computeIcpcPenalty(contestStart, firstAc, 0)).toBe(45);
  });

  it("adds 20 minutes per wrong attempt before AC", () => {
    const contestStart = 0;
    const firstAc = 30 * 60_000; // 30 minutes in ms
    // 30 min time + 3 * 20 min penalty = 90
    expect(computeIcpcPenalty(contestStart, firstAc, 3)).toBe(90);
  });

  it("returns zero penalty when AC is at contest start with no wrong attempts", () => {
    const contestStart = 1_000_000_000_000;
    const firstAc = 1_000_000_000_000; // same as start
    expect(computeIcpcPenalty(contestStart, firstAc, 0)).toBe(0);
  });

  it("handles large time values and many wrong attempts correctly", () => {
    const contestStart = 1_700_000_000_000;
    const firstAc = 1_700_000_000_000 + 300 * 60_000; // 300 minutes later
    // 300 min time + 10 * 20 = 500
    expect(computeIcpcPenalty(contestStart, firstAc, 10)).toBe(500);
  });

  it("floors fractional minutes", () => {
    const contestStart = 0;
    const firstAc = 90_500; // 1.508... minutes
    // floor(90500 / 60000) = 1
    expect(computeIcpcPenalty(contestStart, firstAc, 0)).toBe(1);
  });
});

describe("generateAccessCode", () => {
  it("returns an 8-character string", () => {
    expect(generateAccessCode()).toHaveLength(8);
  });

  it("only contains characters from the allowed set", () => {
    for (let i = 0; i < 20; i++) {
      const code = generateAccessCode();
      for (const ch of code) {
        expect(ALLOWED_CHARS.has(ch)).toBe(true);
      }
    }
  });

  it("never contains I, O, 0, or 1", () => {
    for (let i = 0; i < 20; i++) {
      const code = generateAccessCode();
      for (const banned of DISALLOWED_CHARS) {
        expect(code).not.toContain(banned);
      }
    }
  });

  it("returns uppercase letters only", () => {
    for (let i = 0; i < 10; i++) {
      const code = generateAccessCode();
      expect(code).toBe(code.toUpperCase());
    }
  });

  it("produces different codes on successive calls", () => {
    const codes = new Set(Array.from({ length: 20 }, () => generateAccessCode()));
    // With a 32-char alphabet and 8 positions, collision probability is negligible
    expect(codes.size).toBeGreaterThan(1);
  });
});

describe("normalizeSource", () => {
  it("strips single-line // comments", () => {
    const src = "int x = 1; // this is a comment\nint y = 2;";
    const result = normalizeSource(src);
    expect(result).not.toContain("this is a comment");
  });

  it("strips multi-line /* */ comments", () => {
    const src = "int x; /* block\ncomment */ int y;";
    const result = normalizeSource(src);
    expect(result).not.toContain("block");
    expect(result).not.toContain("comment");
  });

  it("strips Python/shell # comments", () => {
    const src = "x = 1\n# this is a python comment\ny = 2";
    const result = normalizeSource(src);
    expect(result).not.toContain("this is a python comment");
  });

  it("preserves C preprocessor directives", () => {
    const directives = [
      "#include <stdio.h>",
      "#define MAX 100",
      "#pragma once",
      "#ifdef DEBUG",
      "#ifndef HEADER",
      "#endif",
    ];
    for (const directive of directives) {
      const result = normalizeSource(directive);
      // The directive keyword should still be present after normalization
      const keyword = directive.split(/[\s<]/)[0]; // e.g. "#include"
      expect(result).toContain(keyword.toLowerCase());
    }
  });

  it("collapses whitespace", () => {
    const src = "int   x   =   1;";
    const result = normalizeSource(src);
    expect(result).not.toMatch(/\s{2,}/);
  });

  it("lowercases output", () => {
    const src = "INT X = HELLO;";
    const result = normalizeSource(src);
    expect(result).toBe(result.toLowerCase());
  });

  it("replaces string literals with empty string placeholders", () => {
    const src = 'printf("hello world");';
    const result = normalizeSource(src);
    expect(result).not.toContain("hello world");
    expect(result).toContain('""');
  });
});

describe("jaccardSimilarity", () => {
  it("returns 1.0 for identical non-empty sets", () => {
    const a = new Set(["foo bar", "bar baz", "baz qux"]);
    const b = new Set(["foo bar", "bar baz", "baz qux"]);
    expect(jaccardSimilarity(a, b)).toBe(1.0);
  });

  it("returns 0 for completely disjoint non-empty sets", () => {
    const a = new Set(["alpha beta", "beta gamma"]);
    const b = new Set(["delta epsilon", "epsilon zeta"]);
    expect(jaccardSimilarity(a, b)).toBe(0);
  });

  it("returns 0 when both sets are empty", () => {
    expect(jaccardSimilarity(new Set(), new Set())).toBe(0);
  });

  it("returns a value between 0 and 1 for partially overlapping sets", () => {
    const a = new Set(["a b", "b c", "c d"]);
    const b = new Set(["b c", "c d", "d e"]);
    const sim = jaccardSimilarity(a, b);
    expect(sim).toBeGreaterThan(0);
    expect(sim).toBeLessThan(1);
  });

  it("is symmetric: jaccardSimilarity(a, b) === jaccardSimilarity(b, a)", () => {
    const a = new Set(["x y", "y z", "z w"]);
    const b = new Set(["y z", "z w", "w v", "v u"]);
    expect(jaccardSimilarity(a, b)).toBe(jaccardSimilarity(b, a));
  });

  it("computes the correct value for a known overlap", () => {
    // intersection = {"b c"}, union = {"a b", "b c", "c d"} => 1/3
    const a = new Set(["a b", "b c"]);
    const b = new Set(["b c", "c d"]);
    expect(jaccardSimilarity(a, b)).toBeCloseTo(1 / 3);
  });
});
