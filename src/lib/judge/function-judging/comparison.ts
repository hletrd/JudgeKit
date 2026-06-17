import { isArrayType, elementType, type FunctionType } from "./types";
import type { ProblemMutationInput } from "@/lib/validators/problem-management";

/**
 * Resolve the comparison mode actually persisted for a problem.
 *
 * Float-comparison coupling (function-judging v1.1): for a FUNCTION problem the
 * comparison mode is FULLY determined by the RETURN type and is
 * server-authoritative — the inbound `comparisonMode` is ignored entirely.
 *
 *   - return `double`/`double[]` → `"float"`: the return is printed as
 *     whitespace-separated numeric tokens and exact byte-comparison of floats
 *     across languages is unreliable, so the worker's whitespace-token float
 *     comparator is required.
 *   - any other return type      → `"exact"`.
 *
 * Deriving from the return type (rather than trusting the inbound mode) closes
 * the H1 stale-carry-forward bug: a problem that was once `double` (→ float)
 * and is later edited to return `string`/`string[]` must NOT keep `"float"`,
 * otherwise the worker's `compare_float_output` tokenizes on whitespace and a
 * wrong string answer differing only by internal whitespace is wrongly judged
 * Accepted. Only the RETURN couples; a `double` PARAM with a non-double return
 * stays `"exact"`. Author-set `floatAbsoluteError` / `floatRelativeError` are
 * preserved as-is (left null → the worker's default tolerance). Non-function
 * problems are untouched — their inbound `comparisonMode` is respected.
 *
 * CALLER CONTRACT: the `functionSpec` passed here must be the EFFECTIVE spec —
 * on update the merged/stored spec when the body omits it — so the resolved
 * return type reflects what is actually persisted (see updateProblemWithTestCases
 * and the PATCH route which build the effective spec before persisting).
 */
export function resolveComparisonMode(
  input: Pick<
    ProblemMutationInput,
    "problemType" | "comparisonMode" | "functionSpec"
  >,
): ProblemMutationInput["comparisonMode"] {
  if (input.problemType === "function") {
    const returnType = input.functionSpec?.returnType;
    return returnType === "double" || returnType === "double[]" ? "float" : "exact";
  }
  return input.comparisonMode;
}

/** A return type is float-compared when it is `double` or `double[]`. */
export function isFloatComparedReturn(type: FunctionType): boolean {
  return (isArrayType(type) ? elementType(type) : type) === "double";
}
