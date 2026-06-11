# Performance / Concurrency Review — Cycle 4 (2026-05-29)

## Findings

### PERF-C4-1 [Low / Medium] — triple worker SELECT on the claim hot path
`src/app/api/v1/judge/claim/route.ts:130 (auth), 143-150 (status+secret), 298-306
(capacity on miss)`. Under high worker concurrency this is 2-3 extra round-trips
per claim attempt before the atomic claim CTE runs. Bounded by worker count, but
the claim endpoint is the busiest judge path. FIX: collapse into one SELECT or
reuse the auth-helper's fetched row (see CR-C4-2).

### PERF-C4-2 [Low / Low] — `extractClientIp` recompiles regex literals per call
`ip.ts:21,32,40` use inline regex literals inside `isValidIp`, re-created on each
invocation. V8 caches literal regexes per source site, so negligible; informational.

## Confirmations
- `api-rate-limit.ts` uses `SELECT FOR UPDATE` + single transaction per consume,
  DB-server time throughout — no TOCTOU, no clock-skew. Sidecar fast-path is
  fail-open with a circuit breaker (`rate-limiter-client.ts:43-47,63-65`). Sound.
- `rate-limiter-rs` uses `DashMap` sharded locking + a 60s eviction sweep that
  `retain()`s active/blocked entries — no unbounded growth. `saturating_*`
  arithmetic guards overflow. Block multiplier exponent capped at 4. Sound.
- Poll route wraps status+results+worker-decrement in one transaction; leaderboard
  invalidation is fire-and-forget off the critical path. Sound.
