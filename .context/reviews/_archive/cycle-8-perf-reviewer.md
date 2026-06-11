# Cycle 8 Performance Review

**Date:** 2026-04-20
**Reviewer:** perf-reviewer
**Base commit:** ddffef18

## Findings

### PERF-1: SSE connection tracking eviction still uses O(n) linear scan — but now has O(1) per-user count [LOW/LOW]

**File:** `src/app/api/v1/submissions/[id]/events/route.ts:44-55`
**Description:** The eviction loop still iterates all `connectionInfoMap` entries to find the oldest. However, the `userConnectionCounts` Map was added for O(1) per-user connection count lookup (lines 28-29). The eviction is bounded by `MAX_TRACKED_CONNECTIONS` (1000) and runs infrequently. This was previously deferred and remains low priority.
**Fix:** No action required this cycle.
**Confidence:** HIGH (same as prior cycles)

### PERF-2: Judge heartbeat staleness sweep runs on every heartbeat [LOW/LOW]

**File:** `src/app/api/v1/judge/heartbeat/route.ts:72-82`
**Description:** Each heartbeat request triggers a staleness sweep across all workers. This is an unbounded UPDATE query that scans all workers with status "online". Under high worker counts, this could add latency to heartbeat processing.
**Concrete failure scenario:** With 100 workers, each heartbeat triggers an UPDATE across 100 rows every 30 seconds.
**Fix:** Low priority — could be moved to a periodic background job instead of piggybacking on heartbeats.
**Confidence:** LOW

### PERF-3: Judge deregister releases claimed submissions with two sequential queries instead of a single UPDATE [LOW/LOW]

**File:** `src/app/api/v1/judge/deregister/route.ts:62-84`
**Description:** The deregister route first SELECTs all claimed submissions, then UPDATEs them. This could be a single UPDATE ... SET ... WHERE judgeWorkerId = ? AND status IN (...) query.
**Concrete failure scenario:** Minor latency increase on deregister, plus a TOCTOU window between the SELECT and UPDATE.
**Fix:** Replace the SELECT+UPDATE pattern with a single UPDATE with RETURNING.
**Confidence:** LOW

## Verified Safe

- Shared SSE polling is well-implemented: single batch query for all active submission IDs, with per-connection callback dispatch.
- Connection tracking cleanup timer uses `.unref()` to avoid preventing process exit.
- React.cache() is used for deduplication of DB time queries within server renders.
