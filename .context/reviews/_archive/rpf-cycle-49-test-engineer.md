# Cycle 49 — Test Engineer

**Date:** 2026-04-23
**Base commit:** b6daa282

## Findings

### TE-1: No test for ICPC leaderboard tie-breaking [LOW/MEDIUM]

**File:** `src/lib/assignments/contest-scoring.ts:346-357`

**Description:** The IOI leaderboard sort has deterministic tie-breaking with `userId`, added in cycle 46. However, there is no dedicated test for ICPC leaderboard ties where solved count, total penalty, and last AC time are all equal. Without a userId tie-breaker and without a test, this edge case is unverified.

**Fix:** (1) Add `userId` tie-breaker to the ICPC sort comparator. (2) Add a test case where two users have identical ICPC scores and verify the sort is deterministic.

---

### TE-2: Anti-cheat heartbeat gap query transfers up to 5000 rows — carry-over [MEDIUM/MEDIUM]

Already deferred.

---

## Sweep Notes

The test suite for `contest-scoring.ts` covers basic IOI and ICPC ranking. The existing tests should continue to pass after adding the ICPC tie-breaker. The tie-breaker only affects ordering of tied entries, not the computed scores or rank values for non-tied entries.
