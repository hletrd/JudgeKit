# Test Engineer — cycle 6 (2026-06-18)

Test coverage review of v1.1 changes.

## NEW FINDINGS

### TST6-1 (Medium) No test for C++ locale-sensitive double printing
The cross-language string escaping test (`cross-language-string-escaping.test.ts`)
covers string/string[] returns but there is no equivalent test for double returns
across locales. Given that the Java locale fix was explicitly needed, a C++ locale
test is warranted.

Fix: Add a golden test that assembles a C++ harness with a double return, runs it
in a locale with comma decimal separator (or mocks the locale), and verifies the
output uses dot-decimal.
Confidence: High.

### TST6-2 (Medium) No test for comparison mode derivation on type change
`resolveComparisonMode` in `problem-management.ts` derives the comparison mode from
the return type. There should be a test verifying:
1. `double` return → `"float"`
2. `double[]` return → `"float"`
3. `string` return → `"exact"`
4. Type change from `double` to `string` updates comparison mode

Fix: Add unit tests for `resolveComparisonMode`.
Confidence: High.

### TST6-3 (Low) No test for `decodeFieldValue` double[] edge cases
`decodeFieldValue` handles the space-separated double[] contract. Tests should
cover:
- Empty string → `[]`
- Single token → `[n]`
- Multiple tokens with varying whitespace
- Non-finite token → throws

Fix: Add unit tests for `decodeFieldValue`.
Confidence: Low.

## CARRIED FORWARD

- TST-3 (Low) serialization round-trip fuzz for string[] with commas/quotes/newlines
- TST-4 (Low) student-GET referenceSolution-absence integration test
- TST-2 (Medium) mapCompileError over-match regression test — FIXED in cycle 5, test added

## VERIFIED

- Harness smoke tests exist for double returns (`tests/harness/adapters-smoke.test.ts`)
- Unit tests exist for double return adapters (`tests/unit/judge/function-judging/adapters/double-return.test.ts`)
- Float coupling tests exist (`tests/unit/judge/function-judging/float-coupling.test.ts`)
