# Cycle 6 Verifier Review

**Date:** 2026-04-20
**Base commit:** 528cdf29

## Findings

### V-1: Contest detail page `isUpcoming`/`isPast` use `new Date()` — contradicts established DB-time pattern [MEDIUM/HIGH]

**File:** `src/app/(dashboard)/dashboard/contests/[assignmentId]/page.tsx:188-192`
**Description:** The codebase established a clear pattern: use `getDbNow()` or `getDbNowUncached()` for all security-relevant temporal comparisons (recruit page, API key auth, exam sessions, access codes, anti-cheat, submission creation). The contest detail page and problem page still use `new Date()`, violating this pattern.
**Evidence:** The recruit page was fixed in commit 6f6f4750 to use `getDbNow()`. The API key auth was fixed in commit 1ee3e3b9. Exam sessions in commit 9058c8c2. These same types of temporal comparisons are still done with `new Date()` on the contest and problem pages.
**Fix:** Apply the same `getDbNow()` pattern to the contest detail page and problem page.
**Confidence:** HIGH

### V-2: Quick-create contest `startsAt` default uses app-server time — inconsistent with enforcement [MEDIUM/MEDIUM]

**File:** `src/app/api/v1/contests/quick-create/route.ts:28-32`
**Description:** The stored `startsAt` is from `new Date()`. Exam session enforcement (exam-sessions.ts) uses `SELECT NOW()` within the transaction. The submission route uses `NOW()` in SQL. The anti-cheat route uses `getDbNowUncached()`. The stored timestamp and the enforcement time come from different clocks.
**Fix:** Use `getDbNowUncached()` for the default `startsAt` and `deadline` values.
**Confidence:** MEDIUM

## Verified Safe

- All previously fixed clock-skew issues are confirmed working (recruit page, 6 API routes).
- The `getDbNow()` utility properly throws on failure (commit 560ca31b).
- The `getDbNowUncached()` variant works for non-React contexts (commit 0b949d47).
- SSE `viewerId` non-null assertion fix is confirmed (commit 5f5cc4a2 / 76770b0c).
- Unit tests for `escapeLikePattern`, `getDbNow`, `getDbNowUncached` are passing (commit 0b949d47).
