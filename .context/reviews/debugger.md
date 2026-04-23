# Debugger Review — RPF Cycle 47

**Date:** 2026-04-23
**Reviewer:** debugger
**Base commit:** f8ba7334

## Inventory of Files Reviewed

- `src/lib/security/api-rate-limit.ts` — Rate limiting (failure mode analysis)
- `src/lib/realtime/realtime-coordination.ts` — Verified cycle 46 fix
- `src/lib/assignments/submissions.ts` — Submission validation

## Previously Fixed Items (Verified)

- All prior fixes intact and working

## New Findings

### DBG-1: `checkServerActionRateLimit` — rate-limit window reset under clock skew [MEDIUM/MEDIUM]

**File:** `src/lib/security/api-rate-limit.ts:215-234`

**Description:** In `checkServerActionRateLimit`, `const now = Date.now()` is used inside an `execTransaction` to compare against DB-stored `windowStartedAt`. If the app clock is ahead of the DB clock, the window may be expired prematurely, allowing more server action invocations than configured. If the app clock is behind, the window persists longer than intended.

**Failure mode (app clock ahead):** A user's rate-limit window started at DB time 10:00:00. At DB time 10:00:55, the app thinks it's 10:01:00. The check `windowStartedAt + 60000 <= now` evaluates `60000 <= 65000` — true — resetting the counter 5 seconds early. The user gets a fresh window and can perform more actions than configured.

**Fix:** Use `getDbNowUncached()` at the start of the transaction.

**Confidence:** Medium
