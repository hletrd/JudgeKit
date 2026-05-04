import { describe, expect, it, vi } from "vitest";

// Mock DB and related modules before importing the code under test
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/db/queries", () => ({ rawQueryAll: vi.fn() }));
vi.mock("@/lib/db/schema", () => ({ antiCheatEvents: {} }));
vi.mock("@/lib/db-time", () => ({ getDbNowUncached: vi.fn() }));
vi.mock("./code-similarity-client", () => ({ computeSimilarityRust: vi.fn() }));
vi.mock("nanoid", () => ({ nanoid: vi.fn(() => "test-id") }));

import {
  normalizeSource,
  normalizeIdentifiersForSimilarity,
  jaccardSimilarity,
} from "@/lib/assignments/code-similarity";

// ---------------------------------------------------------------------------
// normalizeSource
// ---------------------------------------------------------------------------

describe("normalizeSource", () => {
  it("strips single-line comments", () => {
    // Whitespace collapsed to single spaces, not removed
    expect(normalizeSource("int x = 1; // hello")).toBe("int x = 1;");
  });

  it("strips multi-line comments", () => {
    expect(normalizeSource("int x = 1; /* block\ncomment */ int y = 2;")).toBe("int x = 1; int y = 2;");
  });

  it("collapses whitespace to single spaces", () => {
    expect(normalizeSource("  int   x  =  1;  ")).toBe("int x = 1;");
  });

  it("preserves C preprocessor directives at line start", () => {
    expect(normalizeSource("#include <stdio.h>\nint x = 1;")).toBe("#include <stdio.h> int x = 1;");
  });

  it("preserves #define directives", () => {
    expect(normalizeSource("#define MAX 100\nint x = MAX;")).toBe("#define MAX 100 int x = MAX;");
  });

  it("discards non-preprocessor # lines", () => {
    expect(normalizeSource("int x = 1;\n# not a directive\nint y = 2;")).toBe("int x = 1; int y = 2;");
  });

  it("strips double-quoted string content but outputs empty delimiters", () => {
    // String content stripped, delimiters output as empty: ""
    expect(normalizeSource('char* s = "hello world";')).toBe('char* s = "";');
  });

  it("strips single-quoted string content but outputs empty delimiters", () => {
    expect(normalizeSource("char c = 'a';")).toBe("char c = '';");
  });

  it("strips backtick template literal content but outputs empty delimiters", () => {
    expect(normalizeSource("const s = `hello\nworld`;")).toBe("const s = ``;");
  });

  it("handles escape sequences in strings", () => {
    // "hello\"world" — the escaped quote doesn't close the string
    // so the string is "hello\"world" which is closed by the final "
    expect(normalizeSource('"hello\\"world"')).toBe('""');
  });

  it("discards unclosed double-quoted strings (opening quote not output)", () => {
    expect(normalizeSource('int x = "unclosed\nint y = 1;')).toBe("int x = int y = 1;");
  });

  it("discards unclosed single-quoted strings", () => {
    expect(normalizeSource("int x = 'unclosed\nint y = 1;")).toBe("int x = int y = 1;");
  });

  it("handles empty input", () => {
    expect(normalizeSource("")).toBe("");
  });

  it("handles input with only whitespace", () => {
    expect(normalizeSource("   \n\t  ")).toBe("");
  });

  it("handles input with only comments", () => {
    expect(normalizeSource("// comment\n/* block */")).toBe("");
  });

  it("preserves #ifdef and #endif directives", () => {
    const input = "#ifdef FOO\nint x = 1;\n#endif";
    expect(normalizeSource(input)).toBe("#ifdef FOO int x = 1; #endif");
  });

  it("handles multiple string types in one line", () => {
    expect(normalizeSource('"a" + \'b\' + `c`')).toBe('"\" + \'\' + ``');
  });
});

// ---------------------------------------------------------------------------
// normalizeIdentifiersForSimilarity
// ---------------------------------------------------------------------------

describe("normalizeIdentifiersForSimilarity", () => {
  it("preserves language keywords", () => {
    const input = "if (x) { return y; }";
    const result = normalizeIdentifiersForSimilarity(input);
    expect(result).toContain("if");
    expect(result).toContain("return");
  });

  it("replaces non-keyword identifiers with placeholders", () => {
    const input = "int myVar = otherVar;";
    const result = normalizeIdentifiersForSimilarity(input);
    // myVar -> v1, otherVar -> v2; whitespace preserved
    expect(result).toBe("int v1 = v2;");
  });

  it("replaces same identifier consistently", () => {
    const input = "x + x";
    const result = normalizeIdentifiersForSimilarity(input);
    expect(result).toBe("v1 + v1");
  });

  it("preserves numbers and operators", () => {
    const input = "x = 42 + 3.14";
    const result = normalizeIdentifiersForSimilarity(input);
    expect(result).toContain("42");
    expect(result).toContain("3.14");
    expect(result).toContain("+");
    expect(result).toContain("=");
    expect(result).toContain("v1");
  });

  it("handles empty input", () => {
    expect(normalizeIdentifiersForSimilarity("")).toBe("");
  });

  it("handles input with only keywords", () => {
    const result = normalizeIdentifiersForSimilarity("if else return");
    expect(result).toBe("if else return");
  });

  it("handles underscores in identifiers", () => {
    const input = "my_var + _private";
    const result = normalizeIdentifiersForSimilarity(input);
    expect(result).toBe("v1 + v2");
  });

  it("handles Rust-specific keywords", () => {
    const input = "fn main() { let mut x = self.value; }";
    const result = normalizeIdentifiersForSimilarity(input);
    expect(result).toContain("fn");
    expect(result).toContain("let");
    expect(result).toContain("mut");
    expect(result).toContain("self");
    expect(result).toContain("v1");
  });
});

// ---------------------------------------------------------------------------
// jaccardSimilarity
// ---------------------------------------------------------------------------

describe("jaccardSimilarity", () => {
  it("returns 1.0 for identical sets", () => {
    const a = new Set(["a", "b", "c"]);
    const b = new Set(["a", "b", "c"]);
    expect(jaccardSimilarity(a, b)).toBe(1.0);
  });

  it("returns 0 for disjoint sets", () => {
    const a = new Set(["a", "b"]);
    const b = new Set(["c", "d"]);
    expect(jaccardSimilarity(a, b)).toBe(0);
  });

  it("returns correct value for partially overlapping sets", () => {
    const a = new Set(["a", "b", "c"]);
    const b = new Set(["b", "c", "d"]);
    expect(jaccardSimilarity(a, b)).toBe(0.5);
  });

  it("returns 0 for two empty sets", () => {
    const a = new Set<string>();
    const b = new Set<string>();
    expect(jaccardSimilarity(a, b)).toBe(0);
  });

  it("returns 0 when one set is empty", () => {
    const a = new Set(["a", "b"]);
    const b = new Set<string>();
    expect(jaccardSimilarity(a, b)).toBe(0);
  });

  it("returns 1.0 for two single-element identical sets", () => {
    const a = new Set(["x"]);
    const b = new Set(["x"]);
    expect(jaccardSimilarity(a, b)).toBe(1.0);
  });

  it("returns 0 for two single-element disjoint sets", () => {
    const a = new Set(["x"]);
    const b = new Set(["y"]);
    expect(jaccardSimilarity(a, b)).toBe(0);
  });

  it("handles large sets", () => {
    const items = Array.from({ length: 100 }, (_, i) => `item${i}`);
    const a = new Set(items);
    const b = new Set(items);
    expect(jaccardSimilarity(a, b)).toBe(1.0);
  });
});