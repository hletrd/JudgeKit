# Cycle 49 — Performance Reviewer

**Date:** 2026-04-23
**Base commit:** b6daa282

## Findings

### PERF-1: ICPC leaderboard sort lacks deterministic tie-breaker — redundant sort passes [LOW/LOW]

**File:** `src/lib/assignments/contest-scoring.ts:346-357`

**Description:** When the ICPC sort comparator returns 0 (identical solved, penalty, last AC), JavaScript's `Array.prototype.sort` may reorder elements non-deterministically, potentially causing React re-renders when the leaderboard data is refetched. A deterministic tie-breaker would prevent unnecessary re-renders.

---

### PERF-2: Anti-cheat heartbeat gap query transfers up to 5000 rows — carry-over [MEDIUM/MEDIUM]

**File:** `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:195-204`

**Status:** Already deferred from prior cycles. The 5000-row LIMIT on heartbeat gap detection could be optimized with server-side gap detection SQL.

---

### PERF-3: SSE O(n) eviction scan — carry-over [LOW/LOW]

**File:** `src/app/api/v1/submissions/[id]/events/route.ts:44-55`

**Status:** Already deferred. Bounded at 1000 entries.

---

### PERF-4: `atomicConsumeRateLimit` Date.now() in hot path — carry-over [MEDIUM/MEDIUM]

**File:** `src/lib/security/api-rate-limit.ts:56`

**Status:** Already deferred. Replacing with `getDbNowUncached()` would add a DB round-trip to every API request.

---

## Sweep Notes

No new performance regressions introduced since cycle 48. The contest-scoring stale-while-revalidate pattern (lines 100-128) uses `Date.now()` for in-memory cache TTL, which is appropriate. The analytics route cache (lines 55-83) follows the same pattern correctly.
