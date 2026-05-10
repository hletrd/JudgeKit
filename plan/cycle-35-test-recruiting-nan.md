# Cycle 35 Plan: Add test for recruiting invitation NaN expiryDate bypass

## Source Finding
- TE-1 from cycle 35 test-engineer review
- DBG-1, CRI-2, SEC-2, TR-1, V-2 from other reviewers

## Problem
The recruiting invitation route has a `Number.isFinite(expiresAt.getTime())` guard (added in commit 83cc43ee) to prevent Invalid Date construction from bypassing expiry validation. However, there is no test that verifies this guard actually rejects requests with malformed expiryDate values.

## Implementation

Add a unit test in `tests/unit/api/recruiting-invitations-auth.route.test.ts` or create a new test file that verifies:
1. A request with `expiryDate: "2026-01-01T00:00:00Z"` (contains time component) is rejected with 400
2. A request with `expiryDate: "invalid"` is rejected with 400
3. A request with valid `expiryDate: "2026-12-31"` is accepted

## Exit Criteria
- Tests pass and cover the NaN bypass scenario
- All gates (eslint, tsc, vitest) pass

## Status
- [x] Create test file: `tests/unit/api/recruiting-invitations-expiry-validation.route.test.ts`
- [x] Run tests to verify they pass: All 4 tests pass
- [x] Run gates: eslint, tsc --noEmit, vitest run, vitest run --config vitest.config.component.ts, next build all pass
