# RPF New Cycle 1 -- Performance Review (2026-05-04)

**Reviewer:** perf-reviewer
**HEAD reviewed:** `d617f2d7` (main)
**Scope:** Performance, concurrency, CPU/memory/UI responsiveness. Full codebase scan.
**Prior aggregate:** `_aggregate.md` (cycle 5 RPF, 0 new findings at HEAD `f65d0559`).

---

## Changes since prior reviewed HEAD

Zero source or test changes. Documentation-only commits.

---

## Findings

**0 HIGH, 0 MEDIUM, 0 LOW NEW.**

---

## Performance scan results

### Concurrency
- `execute.ts`: `p-limit` concurrency limiter caps parallel Docker containers to CPU count - 1. Proper cleanup on all paths (success, timeout, error, spawn failure).
- Rate limiting: Atomic `SELECT FOR UPDATE` prevents TOCTOU races. Transaction isolation ensures consistency.

### Caching
- `proxy.ts`: FIFO auth user cache with 2s TTL (max 10s), 500 entry cap. Proper expired entry cleanup at 90% capacity.
- `system-settings-config.ts`: In-memory cache with TTL. `Date.now()` acceptable for in-memory cache.
- `capabilities/cache.ts`: Role cache with TTL. Proper expiration.
- `contest-scoring.ts`: Staleness check cache with `Date.now()` (documented acceptable for cooldown).

### Memory Management
- `execute.ts`: Stdout/stderr capped at 4 MiB. Stream destruction on overflow. Container cleanup on all paths.
- `events/route.ts` (SSE): Connection info map with cleanup interval. Shared polling manager.
- Rate limiter eviction: Periodic cleanup of stale entries (24h age).

### Database
- `db-time.ts`: `getDbNowMs()` wrapped in `react.cache()` for server components. Uncached version for API routes.
- Batch operations: Cleanup uses batch deletes with `LIMIT` and delays between batches.
- `Promise.all` used for parallel DB queries where independent (dashboard layouts, contest pages).

### UI Responsiveness
- Chat widget: `requestAnimationFrame` batching for scroll during streaming. Ref-based state access to avoid unnecessary re-renders.
- Countdown timer: `setTimeout` recursive pattern instead of `setInterval` to avoid catch-up bursts.
- Submission polling: Visibility-aware polling with jitter to avoid thundering herd.

### Date.now() usage
- All server-side temporal comparisons use `getDbNowMs()`. `Date.now()` only in:
  - Edge Runtime (proxy.ts, documented -- cannot use DB query)
  - In-memory caches (system-settings, capabilities, rate-limiter-client)
  - Client-side code (timers, countdown, draft TTL)
  - Health probes (uptime, response time)
- All acceptable or documented with rationale.

## Cross-agent agreement

Consistent with all prior RPF cycle reviews: zero new findings.
