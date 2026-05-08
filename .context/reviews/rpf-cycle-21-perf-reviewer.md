# Performance Review — RPF Cycle 21

**Reviewer:** perf-reviewer
**Date:** 2026-04-24
**Scope:** Full repository

---

## P-1: [LOW] Anti-cheat heartbeat LRU cache uses `Date.now()` for TTL — not performance-critical but inconsistent

**File:** `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:17`
**Confidence:** LOW

The `lastHeartbeatTime` LRU cache has a 120-second TTL. The LRU cache internally uses its own clock for TTL eviction, which is appropriate. The external `Date.now()` usage for dedup (lines 92-96) is the concern raised in CR-1/S-1, but from a performance standpoint, the LRU cache with 10,000 max entries is appropriately sized for the expected number of concurrent exam participants.

No performance issue found.

---

## P-2: [LOW] `systemSettings` cache invalidation causes a synchronous DB read on every admin settings update

**File:** `src/lib/system-settings-config.ts:186-189`
**Confidence:** LOW

`invalidateSettingsCache()` sets `cached = null, cachedAt = 0`. The next call to `getConfiguredSettings()` triggers an async DB read. This is fine for low-frequency admin operations, but if settings were updated programmatically (e.g., via API), rapid successive updates could cause unnecessary DB reads. The 60s TTL mitigates this. No change needed.

---

## Positive Performance Observations

- Proxy auth cache properly uses FIFO eviction with 90% capacity threshold for cleanup (cycle 19 fix verified)
- Judge claim uses atomic SQL with `FOR UPDATE SKIP LOCKED` for high-concurrency correctness
- Submission creation uses `pg_advisory_xact_lock` to serialize concurrent submissions per user
- Audit event buffer batches inserts (50 events or 5s interval) to reduce DB write overhead
- Data retention pruning uses batched deletes (5000 rows per batch) to avoid long-running locks
- Compiler execution uses `pLimit` to cap parallel Docker containers to CPU count
