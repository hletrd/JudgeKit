# Security Reviewer — Cycle 5

**Reviewer:** security-reviewer
**Base commit:** 6bb2b2eb
**Date:** 2026-05-14

## Findings

### S5-1: `realtime-coordination.ts` heartbeat entries never cleaned up from `rateLimits` table [MEDIUM]

- **File:** `src/lib/realtime/realtime-coordination.ts:104-109, 152-203`
- **Confidence:** High
- **Description:** The `acquireSharedSseConnectionSlot` function cleans up expired SSE entries (`realtime:sse:user:%`) from the `rateLimits` table, but `shouldRecordSharedHeartbeat` inserts entries with key prefix `realtime:heartbeat:%` and never deletes them. Over time, the `rateLimits` table accumulates stale heartbeat entries for every assignment/user pair that has ever recorded a heartbeat. With thousands of users and assignments, this causes unbounded table growth and potential performance degradation on the rate-limit queries that scan the same table.
- **Fix:** Add a cleanup step in `shouldRecordSharedHeartbeat` or a periodic background task that removes expired heartbeat entries (`blockedUntil < now` or `lastAttempt < now - minIntervalMs`). Alternatively, use a separate table for heartbeats.

### S5-2: `validateShellCommand` allows `$0-$9` positional parameter expansion [MEDIUM]

- **File:** `src/lib/compiler/execute.ts:173`
- **Confidence:** Medium
- **Description:** Same as C5-1. The shell command validator blocks `$a` but allows `$1`, `$0`, etc. While the Docker sandbox is the primary security boundary, positional parameter expansion in `sh -c` commands is an unnecessary capability that could alter command behavior.
- **Fix:** Change `$[A-Za-z_]` to `$[A-Za-z0-9_]`.

### S5-3: `events/route.ts` `sharedPollTick` unbounded `inArray` query (deferred) [LOW]

- **File:** `src/app/api/v1/submissions/[id]/events/route.ts:224-232`
- **Confidence:** High
- **Description:** Already deferred from cycles 6-7. The shared poll tick collects ALL active submission IDs and queries them in a single `inArray` clause. With 500 concurrent SSE connections, this creates an IN clause with 500 IDs. PostgreSQL performance degrades with large IN lists. The query also has no LIMIT.
- **Fix:** Query by status (`WHERE status IN ('pending', 'queued', 'judging')`) with a reasonable LIMIT instead of by ID list. Or batch the ID list into chunks of 100.

## Summary

3 findings: 2 MEDIUM (1 new, 1 deferred), 1 LOW (deferred). No new auth/authz or injection vulnerabilities found.
