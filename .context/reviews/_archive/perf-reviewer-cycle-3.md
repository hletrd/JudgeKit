# Perf-Reviewer Pass — RPF Cycle 3/100

**Date:** 2026-04-27
**Lane:** perf-reviewer
**Scope:** Performance, concurrency, CPU/memory/UI responsiveness

## Summary

Cycle 2 closed the analytics-route DB-call amplification (cycle-2 PERF2-1) by extracting `refreshAnalyticsCacheInBackground` and using `Date.now()` for the cooldown timestamp directly. No DB round-trip on cache hit (good). No new perf regressions detected in this cycle's surface.

## Findings

### PERF3-1: [LOW] `analyticsCache.set(cacheKey, { data: fresh, createdAt: await getDbNowMs() })` still does one DB round-trip per refresh

**File:** `src/app/api/v1/contests/[assignmentId]/analytics/route.ts:47, 115`
**Confidence:** LOW

Both the cache-miss path (line 115) and the background refresh (line 47) call `await getDbNowMs()` to record the `createdAt` timestamp. Each is one DB round-trip per refresh. This is intentional (cycle-2 design: DB time for persisted-style timestamps) and the trade-off is documented in the route's doc comment.

The optimization opportunity: `Date.now()` for `createdAt` would eliminate the DB call on every cache miss / refresh, since the staleness comparison at line 89 already uses `Date.now()`. The clock skew tolerance is 30s, well above NTP drift. The 1-2s skew window doesn't matter for a 30s threshold.

But: cycle-2 plan task C explicitly committed the hybrid as "deliberate decision (DB time for persistence-relevant timestamps)". Reopening this would require revisiting that decision.

**Fix:** Defer. Reopen if the analytics endpoint becomes a perf hotspot.

---

### PERF3-2: [MEDIUM] `_refreshingKeys` is a `Set<string>` and `_lastRefreshFailureAt` is a `Map<string, number>` — both grow unbounded

**File:** `src/app/api/v1/contests/[assignmentId]/analytics/route.ts:20, 24`
**Confidence:** MEDIUM

The `Set` is cleaned in `finally` after each refresh, so it should never exceed (number of concurrent refreshes) ≤ 100 (LRU max).

The `Map` is cleaned on success (`_lastRefreshFailureAt.delete(cacheKey)` line 48) but NOT cleaned on entry eviction from the LRU. If a cache key fails to refresh, then the LRU evicts that key (e.g., 100 fresh keys arrive after), the cooldown entry persists in `_lastRefreshFailureAt` forever.

Memory bound: O(cacheKeys * 8 bytes for the timestamp) ≈ tiny in practice. But there's no upper bound on `_lastRefreshFailureAt.size` — if assignment IDs change over time, it grows unboundedly.

**Failure scenario:** Long-running app server with many distinct assignment IDs that all experience refresh failures: `_lastRefreshFailureAt.size` grows over weeks. Memory leak (slow).

**Fix:** Either bound `_lastRefreshFailureAt` with an LRU of equal capacity to `analyticsCache`, or attach a stub-eviction handler so when `analyticsCache` evicts a key, we also delete from `_lastRefreshFailureAt`. Slightly involved; can pick up this cycle as a small fix.

---

### PERF3-3: [LOW] `getAuthSessionCookieNames()` allocates a new object on every call

**File:** `src/lib/security/env.ts:178-180`
**Confidence:** LOW

Per CR3-4. Negligible perf impact (one allocation per logout). Defer.

---

### PERF3-4: [INFO] `npm run lint` and `npm run test:unit` runtimes

**Confidence:** N/A (informational)

- Lint completes in ~5–10s; clean.
- Unit-test analytics file alone: 79ms for 7 tests.
- Full unit-test suite presumably: ~10–20s based on prior cycles (will validate during gates).

No perf regressions in CI surface.

## Verification Notes

- Verified the cooldown failure path no longer makes a DB call: `src/app/api/v1/contests/[assignmentId]/analytics/route.ts:52` uses `Date.now()` directly.
- Verified the dedup guard (`_refreshingKeys.has(cacheKey)`) prevents N concurrent refreshes for the same key.

## Confidence

- LOW: PERF3-1, PERF3-3.
- MEDIUM: PERF3-2 (real but slow leak; bounded in practice by the small assignment-ID space).

No HIGH-severity findings. PERF3-2 is the cycle-3 actionable item — small `lru-cache` config or `dispose` hook will close it.
