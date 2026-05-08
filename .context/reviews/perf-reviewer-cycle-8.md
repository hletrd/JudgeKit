# Performance Reviewer — Cycle 8 (Loop 8/100)

**Date:** 2026-04-24
**HEAD commit:** c5644a05

## Methodology

Performance analysis: CPU/memory hot paths, O(n) algorithms, unbounded data structures, N+1 query patterns, and concurrency bottlenecks.

## Findings

**No new performance findings this cycle.**

### Carry-Over Deferred Performance Items

1. **AGG-2 (cycle 45): `atomicConsumeRateLimit` uses `Date.now()` in hot path** — MEDIUM/MEDIUM. Transaction-bound but multi-instance clock skew risk.

2. **AGG-6: SSE connection tracking O(n) eviction scan** — LOW/LOW. Bounded at 1000 entries. `src/app/api/v1/submissions/[id]/events/route.ts:44-55`.

3. **AGG-4: In-memory rate limit O(n log n) eviction sort** — LOW/LOW. Bounded at 10000 entries. `src/lib/security/in-memory-rate-limit.ts:41-47`.

4. **PERF-3: Anti-cheat heartbeat gap query transfers up to 5000 rows** — MEDIUM/MEDIUM. `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:195-204`. For very long contests, this could be significant.

5. **Proxy auth cache FIFO vs LRU** — `src/proxy.ts:23`. The cache uses FIFO eviction (oldest-first) rather than LRU. For auth user caching, FIFO is acceptable since the TTL is 2 seconds and entries are small. Not a finding — just an observation.

### Performance Strengths

- Shared SSE polling (one `setInterval` queries all active submissions in a single batch)
- `pLimit` concurrency control on Docker container spawning
- Stale-while-revalidate pattern for system settings (60s cache + background refresh)
- Output stream truncation at 4 MiB prevents unbounded memory growth
- `executionLimiter` caps parallel containers to `(CPU count - 1)`

## Files Reviewed

`src/lib/security/api-rate-limit.ts`, `src/lib/security/in-memory-rate-limit.ts`, `src/app/api/v1/submissions/[id]/events/route.ts`, `src/lib/compiler/execute.ts`, `src/proxy.ts`, `src/lib/system-settings-config.ts`, `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts`, `src/lib/assignments/contest-scoring.ts`, `src/app/api/v1/contests/[assignmentId]/analytics/route.ts`
