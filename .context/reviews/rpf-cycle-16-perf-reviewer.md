# RPF Cycle 16 — Performance Reviewer

**Date:** 2026-04-24
**HEAD:** bbc1ef67

## Scope

Reviewed performance, concurrency, CPU/memory, and UI responsiveness across:
- In-memory rate limiter
- DB-backed rate limiter
- Proxy middleware (auth cache, CSP generation, locale resolution)
- Audit event buffering
- Docker client operations
- Recruiting token flow
- Judge poll endpoint

## Findings

### P-1: [LOW] Unnecessary DB Query in `getRateLimitConfig()` Per Rate-Limit Check
**Confidence:** Medium
**Citations:** `src/lib/security/rate-limit.ts:20-27`

`getRateLimitConfig()` calls `getConfiguredSettings()` on every rate limit check. If `getConfiguredSettings()` queries the DB each time (not cached), this adds a DB round-trip to every rate-limited request. If it is cached (via `React.cache` or a module-level cache), this is a no-op.

Looking at the function name and the project's pattern of using `getConfiguredSettings()` elsewhere, it appears to be a cached read. However, the DB-backed rate limiter already does a `getDbNowMs()` query per check, so even with caching, the total latency per rate-limit check is at least one DB round-trip.

This is not a new finding — it's a characteristic of the DB-backed design. The in-memory rate limiter avoids this for high-throughput paths.

**Fix:** No immediate fix needed. If `getConfiguredSettings()` is uncached, add caching with a short TTL.

---

### P-2: [LOW] Auth Cache Lacks Periodic Sweep for Expired Entries
**Confidence:** Medium
**Citations:** `src/proxy.ts:55-71`

Already tracked as DEFER-69. Expired entries are cleaned on read, but stale entries accumulate under low traffic. The cache has a 500-entry cap and FIFO eviction, so the worst case is bounded. Reiterated for completeness — no new finding.

---

## Positive Performance Observations

- In-memory rate limiter eviction is now O(1) FIFO (fixed in cycle 15).
- Audit event buffer batches inserts (50 events or 5s interval).
- Proxy auth cache has 2s TTL with FIFO eviction, bounded at 500 entries.
- Docker image removal uses `pLimit(3)` for parallelism.
- DB queries use React.cache() for deduplication in server components.
- Rate limit eviction runs on a 60s interval timer rather than on every check.
