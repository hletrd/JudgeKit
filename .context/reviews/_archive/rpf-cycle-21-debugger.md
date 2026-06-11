# Debugger Review — RPF Cycle 21

**Reviewer:** debugger
**Date:** 2026-04-24
**Scope:** Latent bug surface, failure modes, regressions

---

## D-1: [MEDIUM] Anti-cheat heartbeat dedup `Date.now()` mismatch with DB timestamps (same as CR-1)

**File:** `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:92-96`
**Confidence:** HIGH

The heartbeat dedup logic uses `Date.now()` (line 92) while the inserted event's `createdAt` uses the DB `now` value (line 110). This creates a latent consistency bug: the in-memory `lastHeartbeatTime` map records app-server timestamps, but the DB stores DB-server timestamps. Under clock skew, a heartbeat that is correctly deduped by `Date.now()` may have been allowed by DB time, or vice versa.

This is not just an inconsistency but a latent bug: if the `lastHeartbeatTime` LRU cache is cleared (e.g., server restart, memory pressure), the next heartbeat will always be recorded regardless of the 60s interval. The cache is not persisted, so a server restart effectively resets all heartbeat dedup state.

**Concrete failure scenario:** Server restarts during an exam. All students' heartbeat dedup state is lost. The next heartbeat from each student is inserted even if < 60s since the last one. The instructor sees a cluster of heartbeats right after the restart and may misinterpret this as suspicious activity or a monitoring gap.

**Fix:** Same as CR-1 (use DB time). Additionally, consider using the DB as the source of truth for dedup instead of an in-memory cache, at least for the initial check after a cache miss.

---

## D-2: [LOW] `systemSettings` cache race on invalidation

**File:** `src/lib/system-settings-config.ts:186-189`
**Confidence:** LOW

Same as CR-3. After `invalidateSettingsCache()`, concurrent requests may briefly see default values instead of the previously-cached values. This is not a crash bug but could cause unexpected behavior (e.g., rate limits reverting to defaults for one request).

---

## Positive Observations

- Judge claim uses `FOR UPDATE SKIP LOCKED` which correctly handles concurrent claim attempts
- Exam session creation uses `onConflictDoNothing()` plus re-fetch for idempotency under race conditions
- Submission creation uses `pg_advisory_xact_lock` for serialization
