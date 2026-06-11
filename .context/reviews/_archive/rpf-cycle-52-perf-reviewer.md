# Cycle 52 — Performance Reviewer

**Date:** 2026-04-23
**Base commit:** 1117564e
**Reviewer:** perf-reviewer

## Inventory of Reviewed Files

- `src/lib/assignments/contest-scoring.ts` (full)
- `src/lib/assignments/leaderboard.ts` (full)
- `src/lib/security/api-rate-limit.ts` (full)
- `src/lib/security/in-memory-rate-limit.ts` (full)
- `src/lib/realtime/realtime-coordination.ts` (full)
- `src/app/api/v1/submissions/[id]/events/route.ts` (full)
- `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts` (full)
- `src/app/api/v1/contests/[assignmentId]/analytics/route.ts` (full)
- `src/lib/auth/config.ts` (full)
- `src/proxy.ts` (full)

## Findings

No new performance findings this cycle.

### Carry-Over Confirmations

- **PERF-2:** `atomicConsumeRateLimit` uses `Date.now()` in hot path (MEDIUM/MEDIUM) — deferred. DB round-trip per API request is costlier than clock-skew risk; values are internally consistent within a single server instance.
- **PERF-3:** Anti-cheat heartbeat gap query transfers up to 5000 rows (MEDIUM/MEDIUM) — deferred. Currently functional; SQL window function optimization would require expertise.
- **PERF-4:** SSE O(n) eviction scan in events/route.ts (LOW/LOW) — deferred. Bounded at MAX_TRACKED_CONNECTIONS (1000); rarely triggered.

### Performance Observations

1. The shared SSE polling architecture (`submissionSubscribers` Map with `sharedPollTimer`) is efficient: one batch DB query per tick for all active submission IDs, then dispatch to per-connection callbacks. This avoids N+1 query patterns.

2. The `userConnectionCounts` Map in the SSE route provides O(1) per-user connection count lookup instead of O(n) iteration over all connections — good pattern.

3. The proxy auth cache (`authUserCache`) uses FIFO eviction with a max size of 500 entries and 2-second TTL — appropriate for the workload. Negative results are not cached, preventing cache pollution.

4. The `maybeEvict()` function in `in-memory-rate-limit.ts` runs at most every 60 seconds and has a two-pass eviction strategy (expired entries first, then oldest by `lastAttempt`) — reasonable for the 10,000-entry cap.

5. The stale-while-revalidate cache in `contest-scoring.ts` and `analytics/route.ts` uses per-key cooldown after failure (`REFRESH_FAILURE_COOLDOWN_MS = 5000`) to avoid amplifying DB failures — good defensive pattern.
