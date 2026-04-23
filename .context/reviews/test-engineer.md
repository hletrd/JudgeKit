# Test Engineer Review — RPF Cycle 47

**Date:** 2026-04-23
**Reviewer:** test-engineer
**Base commit:** f8ba7334

## Inventory of Files Reviewed

- `src/lib/security/api-rate-limit.ts` — Rate limiting (testability)
- `src/lib/realtime/realtime-coordination.ts` — Verified cycle 46 fix
- `src/app/(dashboard)/dashboard/problems/create/create-problem-form.tsx` — Zip import

## Previously Fixed Items (Verified)

- `getDbNowUncached` mocked in submissions unit tests: PASS

## New Findings

### TE-1: `checkServerActionRateLimit` uses `Date.now()` making it untestable under simulated clock skew [MEDIUM/MEDIUM]

**File:** `src/lib/security/api-rate-limit.ts:215`

**Description:** `checkServerActionRateLimit` uses `Date.now()` directly inside a transaction, making it impossible to write deterministic tests for clock-skew scenarios. If this function used `getDbNowUncached()`, tests could mock the DB time function to verify behavior under various clock-skew conditions, consistent with the pattern applied to `realtime-coordination.ts` in cycle 46.

**Fix:** Use `getDbNowUncached()` at the start of the transaction.

**Confidence:** Medium

---

### TE-2: Zip import `fileMap.get(key)!` not tested for null guard [LOW/LOW]

**File:** `src/app/(dashboard)/dashboard/problems/create/create-problem-form.tsx:196`

**Description:** The only remaining `Map.get()!` in the codebase. While technically safe (key comes from the map's own keys iterator), no test covers what happens if the map lookup returns undefined.

**Fix:** Replace with null guard.

**Confidence:** Low
