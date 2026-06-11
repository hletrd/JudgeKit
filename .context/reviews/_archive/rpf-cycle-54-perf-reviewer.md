# Cycle 54 — Perf Reviewer

**Date:** 2026-04-23
**Base commit:** 21db1921
**Reviewer:** perf-reviewer

## Inventory of Reviewed Files

- `src/lib/assignments/contest-scoring.ts`
- `src/lib/assignments/leaderboard.ts`
- `src/lib/assignments/code-similarity.ts`
- `src/lib/security/api-rate-limit.ts`
- `src/lib/security/in-memory-rate-limit.ts`
- `src/lib/security/rate-limit.ts`
- `src/app/api/v1/submissions/[id]/events/route.ts`
- `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts`
- `src/app/api/v1/contests/[assignmentId]/analytics/route.ts`
- `src/proxy.ts`

## Findings

No new performance findings this cycle. HEAD (21db1921) advanced only the prior cycle's review/plan docs.

### Carry-Over Confirmations

- **PERF-1:** SSE O(n) eviction scan (LOW/LOW) — deferred. Bounded at MAX_TRACKED_CONNECTIONS (1000).
- **PERF-2:** `atomicConsumeRateLimit` uses `Date.now()` in hot path (MEDIUM/MEDIUM) — deferred. Additional DB round-trip would be worse than the sub-second clock skew concern.
- **PERF-3:** Anti-cheat heartbeat gap query transfers up to 5000 rows (MEDIUM/MEDIUM) — deferred. Window-function refactor out of scope.

### Performance Observations

1. Contest ranking uses stale-while-revalidate cache with cooldown (contest-scoring.ts:98-128) — amplification guard intact.
2. SSE per-user connection count is maintained as an O(1) index (events/route.ts:29, 58-72).
3. `getStaleThreshold()` caches `getConfiguredSettings()` for 5 min to avoid DB lookups per cleanup tick.
4. Code-similarity batch loop yields to the event loop every 100ms.
5. No new hot-path allocations, no quadratic loops, and no unbounded queue growth detected.
