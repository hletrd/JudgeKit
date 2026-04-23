# Critic Review — RPF Cycle 47

**Date:** 2026-04-23
**Reviewer:** critic
**Base commit:** f8ba7334

## Inventory of Files Reviewed

- All recently-modified files and core libraries
- Focus: clock-skew consistency, non-null assertion patterns, error handling

## Previously Fixed Items (Verified)

- All cycle 46 fixes verified and intact:
  - `realtime-coordination.ts` uses `getDbNowUncached()`
  - Contests page uses null guards
  - IOI leaderboard has deterministic tie-breaking

## New Findings

### CRI-1: `checkServerActionRateLimit` uses `Date.now()` in DB transaction — pattern inconsistency [MEDIUM/MEDIUM]

**File:** `src/lib/security/api-rate-limit.ts:215`

**Description:** The codebase has converged on `getDbNowUncached()` for DB-timestamp comparisons inside transactions. `checkServerActionRateLimit` is the only remaining function with this pattern that is not on the hot path (unlike `atomicConsumeRateLimit`, which was deferred due to frequency of invocation).

**Fix:** Use `getDbNowUncached()` at the start of the transaction.

**Confidence:** Medium

---

### Positive Observations

- The `realtime-coordination.ts` fix is well-documented with clear comments explaining the clock-skew rationale.
- The recruiting invitation flow consistently uses `getDbNowUncached()` inside transactions.
- The anti-cheat route correctly uses `rawQueryOne("SELECT NOW()")` for contest boundary checks.
