# Performance Review — Cycle 6

**Date:** 2026-05-14
**Scope:** JudgeKit — DB queries, SSE polling, timers, rate limiting, Docker client, build pipeline
**Base commit:** db6378c8
**Agent:** perf-reviewer (manual single-pass)

---

## Executive Summary

**0 new performance findings**. Cycle-5 M1 fix (heartbeat cleanup) directly addresses the only production degradation risk identified. All other performance-sensitive paths reviewed and unchanged.

---

## Cycle-5 Performance Fix Verification

### M1: `rateLimits` heartbeat cleanup
- **Status:** VERIFIED. The cleanup runs inside the same advisory-locked transaction as the heartbeat update, so there is no extra lock overhead. The `LIKE` query on `blockedUntil < nowMs - minIntervalMs` will only match expired entries, which are few per tick under normal operation.
- **Impact:** Prevents unbounded table growth that would degrade all `rateLimits` queries.

---

## Performance Review of Key Paths

### SSE Shared Polling
- `sharedPollTick` batches all active submission IDs into a single `inArray` query. Under normal load this is efficient.
- The deferred SSE-M2 finding (unbounded `inArray` under extreme subscriber counts) remains unchanged; no new mitigation added this cycle.

### Rate Limiting
- DB-backed rate limiting uses `SELECT FOR UPDATE` for atomicity.
- Sidecar fast-path (`rate-limiter-client`) reduces DB writes.
- Eviction timer (`startRateLimitEviction`) runs every 60s; `stopRateLimitEviction` exported for tests.

### Timer Lifecycle
- All module-level timers now have exported `stop*` functions:
  - `stopSensitiveDataPruning`
  - `stopRateLimitEviction`
  - `stopAuditFlushTimer`
  - `stopSseCleanupTimer`
  - `stopSharedPollTimer`

### Connection Tracking
- `addConnection` uses two-phase eviction (stale scan + FIFO) with O(n) + O(excess) complexity instead of O(n^2).
- Per-user connection counts maintained via separate `Map` for O(1) lookup.

---

## Deferred Performance Items (Stable)

| ID | Severity | File | Description |
|----|----------|------|-------------|
| SSE-M2 | LOW | `events/route.ts:224-232` | `inArray` unbounded under extreme load |
| PERF-2 | LOW | `src/lib/docker/client.ts` | Sequential image fetches could parallelize |
| DEFER-52 | LOW | `src/lib/docker/client.ts` | String accumulation in output parser |

---

## New Findings

None.
