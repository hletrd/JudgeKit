# Test Engineer Review — RPF Cycle 25

**Date:** 2026-04-22
**Base commit:** ac51baaa

## TE-1: No unit tests for `getErrorMessage` default case behavior [LOW/MEDIUM]

**Files:**
- `src/app/(dashboard)/dashboard/groups/[id]/group-members-manager.tsx:84-103`
- `src/app/(dashboard)/dashboard/groups/edit-group-dialog.tsx:47-71`
- `src/app/(dashboard)/dashboard/groups/[id]/assignment-form-dialog.tsx:184-206`
- `src/app/(dashboard)/dashboard/problems/create/create-problem-form.tsx:286-310`

None of the `getErrorMessage` functions have unit tests. This means the default-case error message leak (returning `error.message`) has no test coverage and would not be caught by automated tests.

**Fix:** Add unit tests for each `getErrorMessage` function, including tests for:
- Known error messages (should map to i18n keys)
- Unknown error messages (should return fallback, not raw message)
- Non-Error thrown values (should return fallback)
- SyntaxError instances (should not leak raw message)

---

## TE-2: No tests for `compiler-client.tsx` error display behavior [LOW/MEDIUM]

**File:** `src/components/code/compiler-client.tsx:270-299`

The error handling in `handleRun` has multiple branches (API error, network error, abort error) with different display behaviors. None of these paths have test coverage. A regression in error display (e.g., showing `[object Object]` instead of a readable message) would not be caught.

**Fix:** Add component tests for the `CompilerClient` that verify toast and inline error display for different error response shapes.

---

## TE-3: No tests for `contest-quick-stats.tsx` data validation logic [LOW/MEDIUM]

**File:** `src/components/contest/contest-quick-stats.tsx:63-69`

The stats parsing has complex validation logic with `Number.isFinite(Number(...))` and null checks. No tests verify that:
- Invalid/malformed API responses fall back to previous values
- `avgScore: null` is correctly handled vs `avgScore: 0`
- Non-numeric `participantCount` values are rejected

**Fix:** Add unit tests for the stats parsing logic, extracted into a testable function.

---

## TE-4: Carried test coverage gaps from previous cycles [LOW/MEDIUM]

- TE-1 (cycle 24): No unit tests for `handleBulkAddMembers` -- now fixed but no test added
- TE-2 (cycle 24): No tests verifying raw error messages not leaked in discussion components -- now fixed but no test added
- TE-3 through TE-7 (cycle 24): Carried from previous cycles
- DEFER-36: Security module test coverage gaps
- DEFER-37: Hook test coverage gaps
