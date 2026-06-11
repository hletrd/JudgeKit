# Cycle 10 Performance Review

**Date:** 2026-04-20
**Reviewer:** perf-reviewer
**Base commit:** fae77858

## Findings

### PERF-1: `getDbNowUncached()` called multiple times in same request when `getDbNow()` cache could be used [LOW/LOW]

**Files:** Multiple routes that call `getDbNowUncached()` more than once per request
**Description:** `getDbNowUncached()` executes `SELECT NOW()` each time it's called. Some routes fetch DB time multiple times per request when a single `getDbNow()` call (which uses `React.cache()`) would suffice. The overhead is minimal (one extra query per call) but unnecessary.
**Fix:** Use `getDbNow()` instead of `getDbNowUncached()` when the call is within a React server render context. Reserve `getDbNowUncached()` for API routes that don't have React.cache.
**Confidence:** Low

### PERF-2: Proxy auth cache uses FIFO eviction — acceptable but could be LRU for better hit rates [LOW/LOW]

**Files:** `src/proxy.ts:66-68`
**Description:** The in-process auth cache uses FIFO eviction (deleting the first inserted key). This was a deliberate choice (comment on line 19), and for a 500-entry cache with 2-second TTL, the difference between FIFO and LRU is negligible.
**Fix:** No action required at current scale.
**Confidence:** Low

## Verified Safe

- SSE connection tracking uses bounded data structures with caps.
- DB queries use proper indexes (confirmed via schema analysis).
- No N+1 query patterns detected in server-side code.
- React.cache() is properly used for deduplication in server renders.
