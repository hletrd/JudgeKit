# Cycle 49 — Critic

**Date:** 2026-04-23
**Base commit:** b6daa282

## Findings

### CRI-1: ICPC leaderboard sort non-determinism — consistency gap with IOI [LOW/MEDIUM]

**File:** `src/lib/assignments/contest-scoring.ts:346-357`

**Description:** The IOI sort was fixed in cycle 46 to include `a.userId.localeCompare(b.userId)` as a final tie-breaker, but the ICPC sort has three levels of comparison (solved count, penalty, last AC time) with no final tie-breaker. This is an inconsistency in the scoring module's design contract. Both scoring models should guarantee deterministic output.

**Confidence:** Medium — the probability of exact ties on all three ICPC criteria is low, but the design inconsistency is real.

---

### CRI-2: Anti-cheat heartbeat LRU Date.now() — carry-over [LOW/LOW]

Already deferred from cycle 43.

---

### CRI-3: Practice page unsafe type assertion — carry-over [LOW/LOW]

Already deferred from cycle 47.

---

## Sweep Notes

The codebase is maturing well. The `Date.now()` to `getDbNowUncached()` migration is complete for all critical paths. The remaining deferred items are either LOW/LOW or have explicit performance trade-offs documented.
