# Verifier — cycle 6 (2026-06-18)

Evidence-based correctness verification of v1.1 changes.

## NEW FINDINGS

### VER6-1 (Medium) C++ double printer locale sensitivity NOT verified fixed
`src/lib/judge/function-judging/adapters/cpp.ts:115` uses `snprintf(buf, sizeof(buf), "%.10g", v)`.
Unlike Java which was fixed to `Locale.ROOT`, C++ has no locale pinning. The
`snprintf` function uses the current C locale which defaults to "C" in Docker
containers but could be overridden by environment variables (`LC_ALL`, `LC_NUMERIC`,
`LANG`).

Evidence: The Java fix (commit `275f71aa`) explicitly addressed this. The C++
adapter has no equivalent. The C++ prelude does not include `setlocale(LC_ALL, "C")`.

Failure scenario: A judge worker container running with `LC_ALL=de_DE.UTF-8`
would print `0,5` instead of `0.5` for double returns. The worker's
`compare_float_output` would try to parse `0,5` as f64 and fail, producing
WrongAnswer for all double-return C++ submissions.

Fix: Add `setlocale(LC_ALL, "C");` at the start of C++ main, or use a
locale-independent formatting function.
Confidence: High.

### VER6-2 (Low) `compare_float_output` zero-handling may have edge case
`judge-worker-rs/src/comparator.rs:137-141`
```rust
let rel_ok = if exp_val.abs() > f64::EPSILON {
    diff <= rel_eps * exp_val.abs()
} else {
    diff <= abs_eps
};
```
When expected is 0, the code falls back to absolute error. This is correct.
However, `f64::EPSILON` is approximately 2.22e-16, which is very small. For
expected values like `1e-15`, `exp_val.abs() > f64::EPSILON` is false, so the
code falls back to absolute comparison even though relative comparison would be
more appropriate. This is a minor issue since the absolute tolerance is typically
1e-9, which is much larger than 1e-15.

Confidence: Low.

### VER6-3 (Low) `decodeFieldValue` double[] split does not validate token count
`src/lib/judge/function-judging/value-fields.ts:209-214`
If a stored `double[]` expected output has empty tokens (e.g., `"0.5  0.25"` with
double spaces), the `/\s+/` split produces `['0.5', '0.25']` — correct. But if
the stored value has leading/trailing spaces, `trim()` handles it. If the stored
value is just `""`, it returns `[]`. All good.

But if a user manually enters `"0.5,0.25"` (comma instead of space), the split
produces `['0.5,0.25']` as a single token, which parses as `NaN`. The `Number.isFinite`
check catches this and throws. The caller's try/catch leaves the field blank.
This is acceptable behavior (malformed input → blank field).

Confidence: Low.

## VERIFIED OK

- Double comparison mode derivation: `resolveComparisonMode` correctly returns
  `"float"` for double/double[] returns and `"exact"` for all others.
- Float tolerance inputs: correctly passed through to problem create/update.
- Function judging language enforcement: confirmed at submit time.
- Java Locale.ROOT: confirmed in `adapters/java.ts:176`.
- Single-line stdin assertion: confirmed in `serialization.ts:66-70`.
- Cross-language string escaping: all 7 adapters verified to match canonical contract.
