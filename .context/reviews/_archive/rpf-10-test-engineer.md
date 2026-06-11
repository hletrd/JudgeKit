# Cycle 10 Test Engineer Review

**Date:** 2026-04-20
**Reviewer:** test-engineer
**Base commit:** fae77858

## Findings

### TE-1: No test coverage for access code `redeemAccessCode` DB-time consistency [LOW/MEDIUM]

**Files:** `tests/` (no test file found for `access-codes.ts`)
**Description:** There is no unit test for the `redeemAccessCode` function that verifies DB-time is used for `enrolledAt` and `redeemedAt` timestamps. Given that this function has the same clock-skew pattern that was fixed in 20+ other routes, a test would prevent regression.
**Fix:** Add a test that mocks `getDbNowUncached` (or the raw query) and verifies the `enrolledAt` and `redeemedAt` values use the DB-sourced time.
**Confidence:** Medium

### TE-2: No test coverage for `problem-management.ts` or `assignments/management.ts` DB-time usage [LOW/LOW]

**Files:** `tests/`
**Description:** These library modules use `new Date()` for timestamps but have no test coverage verifying the time source. Low priority since these are lower-impact timestamps.
**Fix:** Add targeted tests when migrating these modules to DB time.
**Confidence:** Low

### TE-3: Client-side date formatting locale tests are missing [LOW/LOW]

**Files:** `tests/`
**Description:** No tests verify that client components use the correct locale for date formatting. The `recruiting-invitations-panel.tsx` fix (cycle 9) was verified manually but has no automated regression test.
**Fix:** Add component tests that verify locale-aware date formatting.
**Confidence:** Low

## Verified Safe

- Existing test mocks for `getDbNowUncached` are properly set up in 10+ test files.
- Test suite passes (288+ tests).
- No flaky test patterns detected.
