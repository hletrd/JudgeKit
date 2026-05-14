# Performance Reviewer — Cycle 5

**Reviewer:** perf-reviewer
**Base commit:** 6bb2b2eb
**Date:** 2026-05-14

## Findings

### P5-1: `realtime-coordination.ts` heartbeat entries never cleaned up from `rateLimits` [MEDIUM]

- **File:** `src/lib/realtime/realtime-coordination.ts:104-109, 152-203`
- **Confidence:** High
- **Description:** Same as S5-1. The `rateLimits` table is used for three different concerns (API rate limiting, SSE slots, heartbeat dedup). Heartbeat entries with prefix `realtime:heartbeat:%` are never cleaned up. Over time this causes table bloat, slowing down all queries that scan `rateLimits` including the rate-limit checks and SSE slot acquisition queries. The `rateLimits` table already has an index on `key`, but expired entries accumulate without bound.
- **Fix:** Add periodic cleanup for expired heartbeat entries, or migrate heartbeats to a separate table.

### P5-2: `events/route.ts` `sharedPollTick` unbounded `inArray` query (deferred) [LOW]

- **File:** `src/app/api/v1/submissions/[id]/events/route.ts:224-232`
- **Confidence:** High
- **Description:** Already deferred. The `inArray(submissions.id, submissionIds)` query has no upper bound on the ID list size. PostgreSQL's query planner may switch to a suboptimal nested loop for large IN lists. Each poll tick queries all active submission IDs simultaneously.
- **Fix:** Batch the query into chunks of 100 IDs, or switch to a status-based query with LIMIT.

### P5-3: `events/route.ts` `stopSharedPollTimer` race with in-progress tick (deferred) [LOW]

- **File:** `src/app/api/v1/submissions/[id]/events/route.ts:161-166`
- **Confidence:** Medium
- **Description:** Already deferred. `stopSharedPollTimer()` clears the interval but does not wait for an in-flight `sharedPollTick()` promise. During graceful shutdown, DB connections may be released mid-query.
- **Fix:** Track the active poll promise and await it in `stopSharedPollTimer`.

### P5-4: `compiler/execute.ts` `runDocker` stdout/stderr UTF-8 boundary split [LOW]

- **File:** `src/lib/compiler/execute.ts:438-456`
- **Confidence:** Low
- **Description:** When truncating stdout/stderr at `MAX_OUTPUT_BYTES`, `chunk.toString("utf8", 0, remaining)` may split a multi-byte UTF-8 character at the boundary, producing invalid UTF-8 in the truncated output. This is a minor data corruption issue for output containing CJK or emoji characters near the 4MiB limit.
- **Fix:** Use a UTF-8-safe truncation method (e.g., `Buffer.toString()` then truncate by code points, or use `TextDecoder` with `stream: true`).

## Summary

4 findings: 1 MEDIUM, 3 LOW (2 deferred). No new OOM or CPU-bound issues found.
