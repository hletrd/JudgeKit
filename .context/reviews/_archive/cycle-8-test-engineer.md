# Cycle 8 Test Engineer Review

**Date:** 2026-04-20
**Reviewer:** test-engineer
**Base commit:** ddffef18

## Findings

### TE-1: No test coverage for `submittedAt` clock-skew behavior in exam submission flow [MEDIUM/MEDIUM]

**File:** `src/app/api/v1/submissions/route.ts:317`
**Description:** The submission creation route uses `submittedAt: new Date()` inside a transaction that also performs exam deadline checks using SQL `NOW()`. There is no test verifying that `submittedAt` is consistent with the deadline check time source. If `submittedAt` is migrated to DB time, a test should verify this behavior to prevent regressions.
**Fix:** Add a test case that verifies `submittedAt` uses DB-sourced time (via `getDbNowUncached()`) when the submission is created during an exam.
**Confidence:** MEDIUM

### TE-2: No test coverage for judge poll `judgedAt`/`judgeClaimedAt` time source [LOW/LOW]

**File:** `src/app/api/v1/judge/poll/route.ts:75,142`
**Description:** No test verifies the time source for `judgedAt` and `judgeClaimedAt` in the judge poll route. If these are migrated to DB time, a test should verify the behavior.
**Fix:** Add a test that mocks `getDbNowUncached` and verifies it is called when recording judge timestamps.
**Confidence:** LOW

### TE-3: Stale plan statuses could lead to redundant test writing [LOW/LOW]

**Files:** `plans/open/2026-04-20-cycle-7-review-remediation.md`
**Description:** The cycle 7 L1 (tests for `tokenInvalidatedAt` clock-skew) is marked TODO, but tests may already exist from a prior cycle. The plan status should be verified before writing duplicate tests.
**Fix:** Verify and update plan status.
**Confidence:** LOW

## Verified Safe

- Existing tests for `getDbNow` and `getDbNowUncached` exist in `tests/unit/datetime.test.ts`.
- Recruit page DB-time tests exist per cycle 27 L1.
