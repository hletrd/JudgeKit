# Architect — cycle 6 (2026-06-18)

Architectural review of v1.1 changes.

## NEW FINDINGS

### ARC6-1 (Medium) Locale sensitivity is an implicit environmental assumption across adapters
The function-judging system assumes all adapters run in a dot-decimal locale.
This is true for most Docker containers (defaulting to POSIX/C), but it's an
implicit environmental assumption, not an explicit contract. The C++ and Java
adapters were both locale-sensitive; Java was fixed, C++ was not.

This is an architectural gap: the system should either (a) explicitly set locale
in every harness, or (b) use locale-independent formatting/parsing everywhere.
Option (b) is preferable because it makes the harnesses self-contained and correct
regardless of environment.

Fix: Audit all adapters for locale independence. Add a CI check or golden test
that verifies dot-decimal output in a non-C locale.
Confidence: Medium.

### ARC6-2 (Low) `resolveComparisonMode` is a pure function but lives in `problem-management.ts`
`src/lib/problem-management.ts:38-49`
This function derives the comparison mode from the return type. It's a pure
function with no DB dependency. It could live closer to the function-judging
module (e.g., `src/lib/judge/function-judging/`) for better cohesion. Currently,
`problem-management.ts` imports from `judge/function-judging/types` but also
exports a function that the judge layer needs.

Fix: Move `resolveComparisonMode` to `src/lib/judge/function-judging/comparison.ts`
or similar.
Confidence: Low.

## CARRIED FORWARD

- ARC-4 (Low) compute-expected duplicates language-config resolution from compiler/run
- ARC-1 (Low) Single-line stdin contract is implicit — partially addressed by assertion

## VERIFIED

- Adapter registry extensibility: still clean
- AUTHORABLE ⊆ SUPPORTED: now true (all types are authorable as of v1.1)
