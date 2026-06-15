/**
 * Rewrites compiler/runtime line references in worker-reported output so they
 * point at the student's own code rather than at the assembled harness.
 *
 * For function-signature problems the source SENT to the worker is
 * `prelude + studentCode + generatedMain`, so every line number the compiler
 * reports is offset by `preludeLineCount`. This maps each `line N` and `:N:`
 * style reference back to `N - preludeLineCount`, clamped to a minimum of 1
 * (a reference that lands inside the prelude is pinned to line 1 rather than
 * shown as 0 or negative). All other text is left untouched.
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
    // ":N:" column-style references, e.g. "solution.cpp:12:5: error"
    .replace(/:(\d+):/g, (_match, digits: string) => `:${shift(Number(digits))}:`);
}
