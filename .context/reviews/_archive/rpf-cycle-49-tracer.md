# Cycle 49 — Tracer

**Date:** 2026-04-23
**Base commit:** b6daa282

## Findings

### TR-1: ICPC leaderboard sort — causal trace of non-determinism [LOW/MEDIUM]

**File:** `src/lib/assignments/contest-scoring.ts:346-377`

**Causal trace:**
1. `computeContestRanking()` builds `entries` array from DB rows
2. ICPC sort comparator (lines 346-357) compares: solved count -> penalty -> last AC time
3. When all three are equal, comparator returns 0
4. `Array.prototype.sort` with a comparator returning 0 gives implementation-defined ordering
5. Rank assignment loop (lines 363-377) checks `prev.totalScore === curr.totalScore && prev.totalPenalty === curr.totalPenalty` for tie detection
6. If the sort is non-deterministic, the same tied users may get different rank values on different requests (though the current tie detection logic means tied users get the same rank regardless of order)

**Competing hypotheses:**
- H1: Non-deterministic sort causes visual flicker but same rank assignment — likely, because the tie detection at line 370 only checks `totalScore` and `totalPenalty`, not sort position
- H2: Non-deterministic sort causes different rank assignment — unlikely with the current tie detection logic, but possible if the tie detection is ever changed

**Verdict:** H1 is more likely. The visual flicker is still a bug that should be fixed.

---

### TR-2: Anti-cheat LRU Date.now() — carry-over [LOW/LOW]

Already deferred.

---

## Sweep Notes

No new causal chains with security or correctness impact found beyond the ICPC tie-breaker.
