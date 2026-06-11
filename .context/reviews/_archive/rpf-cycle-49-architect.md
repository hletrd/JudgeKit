# Cycle 49 — Architect

**Date:** 2026-04-23
**Base commit:** b6daa282

## Findings

### ARCH-1: ICPC leaderboard sort non-determinism [LOW/MEDIUM]

**File:** `src/lib/assignments/contest-scoring.ts:346-357`

**Description:** The IOI leaderboard sort has a deterministic `userId` tie-breaker (added cycle 46), but the ICPC sort lacks one. This is a consistency gap in the scoring module's design contract. Both scoring models should guarantee deterministic output for identical inputs.

**Fix:** Add `userId` tie-breaker to ICPC sort, matching the IOI pattern.

---

### ARCH-2: Manual routes duplicate createApiHandler boilerplate — carry-over [MEDIUM/MEDIUM]

**Status:** Already deferred from prior cycles.

---

### ARCH-3: Stale-while-revalidate cache pattern duplication — carry-over [LOW/LOW]

**Status:** Already deferred. The pattern is duplicated between `contest-scoring.ts` and `analytics/route.ts` but is stable and well-documented.

---

## Sweep Notes

The DB-time migration pattern (replacing `Date.now()` with `getDbNowUncached()`) is now consistently applied across: SSE coordination, server action rate-limiting, assignment PATCH, judge claim, and API rate-limit header. The remaining `Date.now()` uses are either: (a) in-memory-only caches not comparing against DB, (b) client-side code, or (c) already-deferred hot-path items where the DB round-trip cost is a concern.
