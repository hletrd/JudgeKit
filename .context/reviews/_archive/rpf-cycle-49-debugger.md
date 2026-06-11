# Cycle 49 — Debugger

**Date:** 2026-04-23
**Base commit:** b6daa282

## Findings

### DBG-1: ICPC leaderboard sort — non-deterministic rank assignment [LOW/MEDIUM]

**File:** `src/lib/assignments/contest-scoring.ts:346-357`

**Failure mode:** Two users with identical ICPC scores (solved count, total penalty, last AC time) can be assigned different ranks on subsequent requests. This is because:
1. The `sort` comparator returns 0 for tied users (no userId tie-breaker)
2. JavaScript's `Array.prototype.sort` is not guaranteed stable in all engines for equal elements
3. The rank assignment loop (lines 363-377) only considers `totalScore === curr.totalScore && prev.totalPenalty === curr.totalPenalty` as a tie condition
4. If the sort order changes between requests, tied users may get different rank values

**Concrete scenario:** Two students each solve 3 problems with 200 penalty minutes and last AC at 10:30:00. On request A, Alice appears at index 3 and Bob at index 4, both getting rank 4. On request B, Bob is at index 3 and Alice at index 4, both getting rank 4 (ranks are the same, but the leaderboard order differs). In an extreme case with engine-specific behavior, the rank assignment could differ if the tie detection logic doesn't match the sort order.

**Fix:** Add `|| a.userId.localeCompare(b.userId)` to the ICPC sort, matching IOI.

---

### DBG-2: Anti-cheat LRU Date.now() — carry-over [LOW/LOW]

Already deferred.

---

## Sweep Notes

No new latent bugs beyond the ICPC tie-breaker. All previously fixed items remain intact.
