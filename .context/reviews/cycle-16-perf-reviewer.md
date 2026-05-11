# Cycle 16 — Performance Review

**Date:** 2026-05-11
**HEAD reviewed:** `5a400792`
**Prior aggregate:** `_aggregate-cycle-15.md`

---

## New Findings

**None.** The codebase has not changed since cycle 15 (`af634e63`).

---

## Performance Verification

### Verified Optimizations (Still in Place)

| Optimization | Location | Status |
|---|---|---|
| React.cache for DB time | `src/lib/db-time.ts:18` | Active — single query per server render |
| Stale-while-revalidate for contest rankings | `src/lib/assignments/contest-scoring.ts` | Active — background refresh with proper cleanup |
| Sidecar fast-path for API rate limits | `src/lib/security/api-rate-limit.ts:48-55` | Active — saves DB round-trip when over limit |
| pLimit(2) for contest replay snapshots | `src/lib/assignments/contest-replay.ts` | Active — reduced from 4 to protect DB pool |
| CreatedAt parsing from docker ps | `src/lib/compiler/execute.ts:831-865` | Active — eliminates redundant docker inspect calls |
| WeakMap dedup for API rate limit consumption | `src/lib/security/api-rate-limit.ts:62-72` | Active — prevents double-counting within same request |

### Observations (No Issue)

1. **Heartbeat gap detection:** Now fetches DESC order and reverses, ensuring most recent 5000 heartbeats are examined. No N+1 risk.

2. **Visibility polling jitter:** `use-visibility-polling.ts` adds 0-500ms random jitter on tab switch to prevent thundering herd. Good pattern.

3. **Rate-limit eviction:** Best-effort background eviction every 60s via `setInterval` with `unref()`. Timer properly cleaned up by `stopRateLimitEviction`.

---

## Deferred Performance Items (Unchanged)

- C2-AGG-6: Practice page performance (LOW) — deferred, p99 > 1.5s OR > 5k matching problems
- PERF-3: Anti-cheat dashboard query (MEDIUM) — deferred, p99 > 800ms OR > 50 concurrent contests
- ARCH-CARRY-2: SSE coordination (LOW) — deferred, SSE perf cycle OR > 500 concurrent
