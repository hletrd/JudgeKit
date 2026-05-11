# Code Review — Cycle 6 (Updated)

**Reviewer:** code-reviewer
**Date:** 2026-05-11
**Scope:** Full codebase, focus on recently-modified areas (SSE events, judge/poll, restore, compiler/execute, anti-cheat, audit-logs, node-shutdown)

---

## HIGH

None.

---

## MEDIUM

### M1: `sharedPollTick` `inArray` Query Unbounded Growth Risk
- **File:** `src/app/api/v1/submissions/[id]/events/route.ts:229-232`
- **Confidence:** Medium
- **Description:** The shared poll timer builds `submissionIds` from all active subscribers and queries them with `inArray(submissions.id, submissionIds)`. Under heavy load (e.g., 500+ concurrent SSE connections during a contest), this produces a very large IN clause. PostgreSQL performance degrades with large IN lists, and the query plan may switch to a suboptimal nested loop. Additionally, Drizzle's `inArray` may hit internal array-size limits.
- **Fix:** Cap the batch size and poll in chunks, or switch to a status-based query (`WHERE status IN ('pending', 'queued', 'judging')`) instead of ID-based.

### M2: `stopSharedPollTimer` Race with In-Progress `sharedPollTick`
- **File:** `src/app/api/v1/submissions/[id]/events/route.ts:161-166`
- **Confidence:** Medium
- **Description:** `stopSharedPollTimer()` clears the interval timer but does not wait for an in-flight `sharedPollTick()` promise to complete. During graceful shutdown, if `stopSharedPollTimer` is called while `sharedPollTick` is awaiting its DB query, the DB connection may be released mid-query or the process may exit before the query completes.
- **Fix:** Track the active poll promise and await it in `stopSharedPollTimer` before returning.

---

## LOW

### L1: Double-Close Risk in SSE `emitStatusHeartbeat`
- **File:** `src/app/api/v1/submissions/[id]/events/route.ts:433-446`
- **Confidence:** Medium
- **Description:** `emitStatusHeartbeat` calls `close()` on enqueue error, which sets `closed = true` and unsubscribes. But the caller in `onPollResult` (line 491) doesn't check the return value and falls through. If another event arrives before the stream actually closes, `onPollResult` could attempt to call `emitStatusHeartbeat` again while `close()` is still running, leading to a double-unsubscribe or double-release of the shared SSE connection slot.
- **Fix:** Return early from `onPollResult` after `emitStatusHeartbeat` returns false, or guard `close()` with a stronger atomic check.

### L2: Compiler `runDocker` Missing Timeout on `child.kill`
- **File:** `src/lib/compiler/execute.ts:459-464`
- **Confidence:** Low
- **Description:** The timeout handler calls `child?.kill("SIGKILL")` but `child.kill()` returns a boolean indicating whether the signal was successfully sent. It does not wait for the process to actually exit. If the Docker process is stuck in an uninterruptible state, the subsequent `stopContainer` may race with the `on("close")` handler.
- **Fix:** Add a grace-period timeout after `kill()` before calling `stopContainer`, or verify the child PID is gone.

### L3: Audit-Logs CSV Export Missing Row Count Cap Validation
- **File:** `src/app/api/v1/admin/audit-logs/route.ts:218-219`
- **Confidence:** Low
- **Description:** `MAX_CSV_EXPORT_ROWS = 10_000` is applied as a `.limit()`, but the total row count query (line 190) is not similarly capped. For a very large audit log table, the count query could still be expensive even though only 10k rows are returned.
- **Fix:** Add a time-range requirement for CSV exports, or document that the count is approximate for large datasets.

---

## Final Sweep Notes

- Examined 45+ source files across API routes, lib utilities, and components.
- Previous cycles' fixes (getDbNowUncached moved out of transactions, file.type removed from ZIP detection) are correctly applied.
- No new SQL injection vectors found; all raw SQL uses parameterized queries.
- No new auth bypass patterns found; `createApiHandler` middleware remains solid.
