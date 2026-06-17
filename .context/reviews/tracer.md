# Tracer — cycle 6 (2026-06-18)

Causal tracing of v1.1 double support flow.

## FLOW TRACE: Double-return judging

1. Author sets return type to `double` or `double[]` in `FunctionSignatureBuilder`
2. `createProblemForm` / `editProblemForm` calls `resolveComparisonMode` → `"float"`
3. Problem is persisted with `comparisonMode = "float"`
4. Author computes expected outputs via `compute-expected/route.ts`
5. `compute-expected` assembles reference solution with adapter's `printBlock`
6. For double: adapter prints whitespace-separated numeric tokens (e.g., `0.5` or `0.5 0.25`)
7. Expected output stored as space-separated tokens
8. Student submits solution in any enabled language
9. Judge worker claims submission, assembles student code with same adapter
10. Worker runs test cases, compares with `compare_float_output`
11. `compare_float_output` tokenizes on whitespace, parses each token as f64

## HYPOTHESIS A: C++ locale causes WrongAnswer for all double submissions
**Evidence:** C++ `snprintf` with `%.10g` is locale-sensitive. In comma-locale,
`0.5` prints as `0,5`. The worker's `parse::<f64>()` expects dot-decimal.
**Status:** CONFIRMED — the C++ adapter lacks locale pinning that Java has.
**Severity:** Medium (affects all double-return C++ submissions in non-C locale).

## HYPOTHESIS B: C++ `stod` locale causes arg parsing truncation
**Evidence:** C++ `stod` is locale-sensitive. In comma-locale, `stod("0.5")` stops
at the dot and parses `0`.
**Status:** CONFIRMED — same root cause as Hypothesis A.
**Severity:** Medium (affects all double-arg C++ submissions in non-C locale).

## HYPOTHESIS C: Float tolerance defaults are reasonable
**Evidence:** `compare_float_output` defaults to `abs=1e-9, rel=1e-9`. The `%.10g`
format in C++ and Java produces ~10 significant digits. The tolerance is slightly
looser than the precision, which is appropriate for cross-language comparison.
**Status:** LIKELY OK — no issue found.

## CARRIED FORWARD

- Hypothesis from cycle 1 (string escaping divergence): FIXED in cycle 5
