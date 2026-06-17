/**
 * Rewrites compiler/runtime line references in worker-reported output so they
 * point at the student's own code rather than at the assembled harness.
 *
 * For function-signature problems the source SENT to the worker is
 * `prelude + studentCode + generatedMain`, so every line number the compiler
 * reports is offset by `preludeLineCount`. This maps each `line N` and
 * filename-anchored `<file>.<ext>:N[:col]` reference back to
 * `N - preludeLineCount`, clamped to a minimum of 1 (a reference that lands
 * inside the prelude is pinned to line 1 rather than shown as 0 or negative).
 * All other text is left untouched.
 *
 * The line-number rewrite is FILENAME-ANCHORED: only `:N:` that immediately
 * follows a source-file token (`name.ext:`) is shifted. A bare `:N:`, a column
 * pair like `12:5` inside a caret/annotation line, a clock time like `12:30:45`,
 * or any other unrelated `:N:` digits are left intact — they are not compiler
 * file:line references and must not be rewritten.
 *
 * PURE: deterministic, no I/O. `preludeLineCount` must be RECOMPUTED via
 * `functionPreludeLineCount(spec, language)` — it is never stored.
 */
export function mapCompileError(output: string, preludeLineCount: number): string {
  if (preludeLineCount <= 0 || !output) {
    return output;
  }

  const shift = (n: number): number => Math.max(1, n - preludeLineCount);

  return output
    // "line N" (case-insensitive), e.g. "error at line 7" / "compilation terminated at line 12"
    .replace(/\bline (\d+)\b/gi, (_match, digits: string) => `line ${shift(Number(digits))}`)
    // Filename-anchored "<file>.<ext>:N" line reference, e.g.
    // "solution.cpp:12:5: error" or "Main.java:7: error". Only the line number
    // (the digits right after the filename's colon) is shifted; the optional
    // trailing ":col" and the rest of the text are preserved verbatim. The
    // leading filename token is matched (not just looked-behind) so that
    // `:N:` not preceded by a `name.ext:` is never touched.
    .replace(
      /([A-Za-z0-9_.\-/]+\.[A-Za-z0-9]+:)(\d+)(?=:|\s|$)/g,
      (_match, fileToken: string, digits: string) => `${fileToken}${shift(Number(digits))}`,
    );
}
