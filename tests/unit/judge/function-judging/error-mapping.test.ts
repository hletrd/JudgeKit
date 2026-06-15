import { describe, expect, it } from "vitest";
import { mapCompileError } from "@/lib/judge/function-judging/error-mapping";

describe("mapCompileError", () => {
  it("rewrites a 'line N' reference to the student-relative line", () => {
    expect(mapCompileError("error at line 7: bad", 4)).toBe("error at line 3: bad");
  });

  it("rewrites a ':N:' column-style reference", () => {
    expect(mapCompileError("solution.py:7:5: SyntaxError", 4)).toBe(
      "solution.py:3:5: SyntaxError",
    );
  });

  it("clamps mapped line numbers to a minimum of 1 (never below 1)", () => {
    expect(mapCompileError("line 4: in prelude", 4)).toBe("line 1: in prelude");
    expect(mapCompileError("line 2: in prelude", 4)).toBe("line 1: in prelude");
    expect(mapCompileError("file.cpp:1:1: oops", 4)).toBe("file.cpp:1:1: oops");
  });

  it("is a no-op when preludeLineCount is 0", () => {
    const input = "line 7: error\nfile.cpp:9:2: warning";
    expect(mapCompileError(input, 0)).toBe(input);
  });

  it("leaves non-line-reference text intact", () => {
    expect(mapCompileError("undefined reference to `foo'", 4)).toBe(
      "undefined reference to `foo'",
    );
  });

  it("rewrites every reference across a multi-line compiler output", () => {
    const input = [
      "solution.cpp: In function 'main':",
      "solution.cpp:12:5: error: 'x' was not declared in this scope",
      "   12 |     x = 1;",
      "      |     ^",
      "solution.cpp:15:9: note: suggested alternative",
      "compilation terminated at line 12",
    ].join("\n");

    const expected = [
      "solution.cpp: In function 'main':",
      "solution.cpp:7:5: error: 'x' was not declared in this scope",
      "   12 |     x = 1;",
      "      |     ^",
      "solution.cpp:10:9: note: suggested alternative",
      "compilation terminated at line 7",
    ].join("\n");

    expect(mapCompileError(input, 5)).toBe(expected);
  });

  it("does not touch numbers that are not line references", () => {
    expect(mapCompileError("expected 256 bytes but got 512", 4)).toBe(
      "expected 256 bytes but got 512",
    );
  });
});
