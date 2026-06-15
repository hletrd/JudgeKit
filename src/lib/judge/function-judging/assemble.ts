import { getAdapter } from "./registry";
import type { FunctionSpec } from "./types";

/**
 * Assembles a function-signature submission into a full stdin/stdout compile
 * unit by delegating to the language adapter. Returns the assembled `source`
 * (prelude + student code + generated main) and the `preludeLineCount` (lines
 * of prelude emitted before the student's code).
 *
 * Throws when the language has no registered adapter.
 */
export function assembleFunctionSubmission(
  spec: FunctionSpec,
  language: string,
  studentCode: string,
): { source: string; preludeLineCount: number } {
  return getAdapter(language).assemble(spec, studentCode);
}

/**
 * Recomputes the prelude line count deterministically by assembling the spec
 * with empty student code. The prelude offset is NEVER stored — it is always
 * recomputed from the spec + language so it can never drift from the assembled
 * source. Used by compile-error line mapping (see error-mapping.ts).
 *
 * Throws when the language has no registered adapter.
 */
export function functionPreludeLineCount(spec: FunctionSpec, language: string): number {
  return getAdapter(language).assemble(spec, "").preludeLineCount;
}
