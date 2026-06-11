# Performance Reviewer — Cycle 9 (Loop 9/100)

**Date:** 2026-04-24
**HEAD commit:** 524d59de

## Methodology

Performance analysis: CPU/memory hot paths, O(n) algorithms, unbounded data structures, N+1 query patterns, and concurrency bottlenecks.

## Findings

**No new performance findings this cycle.**

### Carry-Over Deferred Performance Items

1. **AGG-2 (cycle 45): `atomicConsumeRateLimit` uses `Date.now()` in hot path** — MEDIUM/MEDIUM.
2. **AGG-6: SSE connection tracking O(n) eviction scan** — LOW/LOW. Bounded at 1000.
3. **AGG-4: In-memory rate limit O(n log n) eviction sort** — LOW/LOW. Bounded at 10000.
4. **PERF-3: Anti-cheat heartbeat gap query transfers up to 5000 rows** — MEDIUM/MEDIUM.

### Performance Strengths Re-verified

- Shared SSE polling (single `setInterval` queries all active submissions)
- `pLimit` concurrency control on Docker container spawning
- Stale-while-revalidate for system settings (60s cache + background refresh)
- Output stream truncation at 4 MiB prevents unbounded memory growth
- Contest scoring uses 30s TTL cache with 15s stale-while-revalidate + failure cooldown
- Batched DELETE with `ctid IN (SELECT ctid ... LIMIT N)` avoids long locks

## Files Reviewed

`src/lib/security/api-rate-limit.ts`, `src/lib/security/in-memory-rate-limit.ts`, `src/app/api/v1/submissions/[id]/events/route.ts`, `src/lib/compiler/execute.ts`, `src/lib/system-settings-config.ts`, `src/lib/assignments/contest-scoring.ts`, `src/lib/data-retention-maintenance.ts`, `src/lib/db/cleanup.ts`, `src/lib/audit/events.ts`
