# Cycle 53 — Perf Reviewer

**Date:** 2026-04-23
**Base commit:** 1117564e
**Reviewer:** perf-reviewer

## Inventory of Reviewed Files

- `src/lib/assignments/contest-scoring.ts` (full)
- `src/lib/assignments/leaderboard.ts` (full)
- `src/lib/assignments/code-similarity.ts` (full)
- `src/lib/security/api-rate-limit.ts` (full)
- `src/lib/security/in-memory-rate-limit.ts` (full)
- `src/lib/security/rate-limit.ts` (full)
- `src/app/api/v1/submissions/[id]/events/route.ts` (full)
- `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts` (full)
- `src/app/api/v1/contests/[assignmentId]/analytics/route.ts` (full)
- `src/proxy.ts` (full)

## Findings

No new performance findings this cycle. HEAD (1117564e) is identical to the base commit reviewed in cycle 52.

### Carry-Over Confirmations

- **PERF-1:** SSE O(n) eviction scan (LOW/LOW) — deferred. Bounded at MAX_TRACKED_CONNECTIONS (1000); rarely triggered.
- **PERF-2:** `atomicConsumeRateLimit` uses `Date.now()` in hot path (MEDIUM/MEDIUM) — deferred. DB round-trip costlier than clock-skew risk; values internally consistent within a single server instance.
- **PERF-3:** Anti-cheat heartbeat gap query transfers up to 5000 rows (MEDIUM/MEDIUM) — deferred. Window function refactor out of scope.

### Performance Observations

1. Contest ranking uses stale-while-revalidate cache with cooldown to prevent amplifying DB failures (contest-scoring.ts:98-128).
2. Per-user connection count is maintained as O(1) index rather than O(n) Set iteration (events/route.ts:29, 58-72).
3. Rate-limit sidecar pre-check avoids DB transaction when the key is already over its limit.
4. `getStaleThreshold()` caches `getConfiguredSettings()` for 5 minutes to avoid DB lookups on every 60s cleanup tick.
5. Code-similarity batch loop yields to the event loop every 100ms to prevent starving the Node.js single-threaded runtime during long comparisons.
