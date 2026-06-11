# Performance Reviewer — Cycle 3 Deep Review (2026-05-01)

**HEAD reviewed:** `894320ff` (main)

## Inventory of performance-relevant files

- `src/lib/security/in-memory-rate-limit.ts` (Map-based rate limiter)
- `src/lib/security/api-rate-limit.ts` (DB-backed rate limiter with sidecar)
- `src/lib/security/rate-limit.ts` (login rate limiter with eviction)
- `src/lib/realtime/realtime-coordination.ts` (SSE connection management)
- `src/lib/compiler/execute.ts` (Docker container execution with concurrency limiter)
- `src/lib/assignments/scoring.ts` (SQL-based scoring with CASE expressions)
- `src/lib/submissions/visibility.ts` (submission sanitization with N+1 risk)
- `src/lib/homepage-insights.ts` (homepage data aggregation queries)
- `src/lib/db/index.ts` (connection pool configuration)

## Findings

### C3-PERF-1: `in-memory-rate-limit.ts:31-56` — eviction runs synchronously inside rate-limit check (LOW, confidence: High)

**File:** `src/lib/security/in-memory-rate-limit.ts:31-56`

The `maybeEvict()` function is called at the start of every `isRateLimitedInMemory`, `recordAttemptInMemory`, and `recordFailureInMemory` call. While it has a 60-second guard, when eviction does trigger, it iterates the entire `store` Map (up to 10,000 entries) to collect expired keys, then deletes them, then potentially iterates again for FIFO eviction. Under high throughput (e.g., 1000 req/s on a rate-limited endpoint), this adds latency on the first request after each 60-second window.

**Failure scenario:** A burst of requests hits the rate limiter right after the 60-second eviction window opens. The first request blocks for the duration of a full Map iteration (potentially O(n) where n = 10,000), causing a latency spike.

**Fix:** Consider running eviction in a `setInterval` background timer (like the DB-backed `rate-limit.ts` does) rather than inline. Alternatively, use a `setTimeout` deferred pattern that runs after the current event loop tick.

### C3-PERF-2: `submissions/visibility.ts:90-99` — N+1 query pattern in submission sanitization (LOW, confidence: High)

**File:** `src/lib/submissions/visibility.ts:90-99`

(Same as C3-CR-5) The `sanitizeSubmissionForViewer` function makes an individual DB query for each submission's assignment visibility when `assignmentVisibility` is not provided. In bulk contexts (submission list page), this creates N+1 queries.

**Fix:** Make `assignmentVisibility` required in bulk contexts, or batch-fetch assignment visibility before calling this function.

### C3-PERF-3: `compiler/execute.ts:381` — `executionLimiter` uses `pLimit` which queues unboundedly (LOW, confidence: Medium)

**File:** `src/lib/compiler/execute.ts:381`

The `executionLimiter` uses `pLimit(Math.max(cpus().length - 1, 1))` to cap concurrent Docker containers. However, `pLimit` queues pending tasks without bound. If many judge runs are submitted simultaneously, the queue grows without limit, and each queued task holds a closure over the request context (source code, stdin, etc.) until it executes. This can cause memory pressure under sustained high load.

**Failure scenario:** 500 submissions arrive in quick succession. The concurrency limiter allows only ~7 concurrent Docker runs, but queues 493 closures holding source code (up to 64KB each = ~31MB), plus the request objects.

**Fix:** Add a queue size limit to `executionLimiter`. If the queue is full, return a "runner at capacity" error immediately rather than queuing.

### C3-PERF-4: `db/index.ts:38-43` — connection pool defaults may be insufficient (LOW, confidence: Low)

**File:** `src/lib/db/index.ts:38-43`

The PostgreSQL connection pool defaults to `max: 20` connections. For a production server handling concurrent API requests, SSE connections, and rate-limit eviction, 20 connections may be a bottleneck, especially when the realtime coordination module acquires advisory locks.

**Fix:** This is configurable via `DATABASE_POOL_MAX` env var. No code change needed, but the default could be raised to 30 or documented as requiring tuning.

## Verified performance patterns

- **Docker container cleanup:** Orphaned container cleanup runs periodically with 10-minute age threshold.
- **Rate-limit sidecar:** Fast-path sidecar check avoids DB round-trip for already-limited keys.
- **Output truncation:** Both TS and Rust runners cap stdout/stderr at 4 MiB.
- **DB time caching:** `getDbNowMs` uses cached values to avoid per-request DB time queries.

## Final sweep

All performance-critical paths examined. No HIGH/MEDIUM performance findings. Carry-forward PERF-3 (anti-cheat heartbeat query) and AGG-2 (Date.now caching) remain deferred with valid exit criteria.
