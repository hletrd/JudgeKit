# RPF Cycle 11 — Test Engineer

**Date:** 2026-04-20
**Base commit:** 74353547

## Findings

### TE-1: No test coverage for recruiting token DB-time consistency in transaction path [LOW/MEDIUM]

**File:** `tests/`
**Description:** While rpf-10 L2 added tests for `access-codes.ts` DB-time consistency, there is no equivalent test for the `redeemRecruitingToken` transaction path. The 7 `new Date()` calls in this path are currently untested for clock-skew consistency. When these are fixed to use `getDbNowUncached()`, a test should verify that all written timestamps use the DB-sourced value.
**Confidence:** MEDIUM
**Fix:** Add a test that mocks `getDbNowUncached` and verifies that `enrolledAt`, `redeemedAt`, and `updatedAt` in the recruiting token transaction path use the DB-sourced time value.

### TE-2: No integration test for backup manifest timestamp consistency [LOW/LOW]

**File:** `tests/`
**Description:** There is no test verifying that the backup manifest's `createdAt` field matches the export's `exportedAt` field. While this is cosmetic, a test would catch regressions if the timestamps diverge after refactoring.
**Confidence:** LOW
**Fix:** Low priority. Could add a test that creates a backup and verifies manifest timestamp consistency.

## Verified Safe

- Access code DB-time tests added in rpf-10 L2.
- DB-time mocks added to affected tests in rpf-10.
