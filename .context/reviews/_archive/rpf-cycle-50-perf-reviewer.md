# Cycle 50 — Performance Reviewer

**Date:** 2026-04-23
**Base commit:** 6463cdda
**Reviewer:** perf-reviewer

## Inventory of Reviewed Files

- `src/lib/assignments/contest-scoring.ts` (full)
- `src/lib/security/api-rate-limit.ts` (full)
- `src/lib/security/in-memory-rate-limit.ts` (full)
- `src/app/api/v1/submissions/[id]/events/route.ts` (full)
- `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts` (full)
- `src/app/api/v1/contests/[assignmentId]/analytics/route.ts` (full)

## Findings

No new performance findings this cycle.

### Carry-Over Confirmations

- PERF-2: Anti-cheat heartbeat gap query transfers up to 5000 rows (MEDIUM/MEDIUM) — deferred
- PERF-3: SSE O(n) eviction scan (LOW/LOW) — deferred, bounded at 1000 entries
- PERF-4: `atomicConsumeRateLimit` uses Date.now() in hot path (MEDIUM/MEDIUM) — deferred for performance reasons (DB round-trip per API request is costlier than the clock-skew risk)

## Sweep Notes

The ICPC tie-breaker fix from cycle 49 adds `localeCompare` as a final comparison, which is O(1) and negligible. The stale-while-revalidate cache in contest-scoring uses `Date.now()` for in-memory TTL, which is appropriate (no DB comparison). No new performance regressions introduced.
