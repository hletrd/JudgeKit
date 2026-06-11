# Performance Review — Cycle 6 (Updated)

**Reviewer:** perf-reviewer
**Date:** 2026-05-11
**Scope:** SSE polling, database queries, compiler execution, anti-cheat heartbeat processing

---

## HIGH

None.

---

## MEDIUM

### M1: SSE `sharedPollTick` Unbounded `inArray` Query
- **File:** `src/app/api/v1/submissions/[id]/events/route.ts:224-232`
- **Confidence:** High
- **Description:** The shared poll tick collects ALL active submission IDs from `submissionSubscribers` and queries them in a single `inArray(submissions.id, submissionIds)` query. With 500 concurrent SSE connections, this creates an IN clause with 500 IDs. PostgreSQL's query planner may switch to a sequential scan or nested loop when IN lists grow large. The query also has no LIMIT, so it could return many rows if submissions are shared across connections.
- **Concrete scenario:** During a large contest, 500+ students submit and keep SSE connections open. Each poll tick sends a query with 500 IDs to PostgreSQL, causing CPU spikes and query queue buildup.
- **Fix:** Query by status (`WHERE status IN ('pending', 'queued', 'judging')`) with a reasonable LIMIT instead of by ID list. Or batch the ID list into chunks of 100.

### M2: Anti-Cheat Heartbeat Gap Detection Loads 5000 Rows into Memory
- **File:** `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:199-227`
- **Confidence:** Medium
- **Description:** When filtering anti-cheat events by `userId`, the endpoint fetches up to 5000 heartbeat rows and reverses them in memory for gap detection. For a long contest (e.g., 4 hours), this is ~240 rows (one per minute), so 5000 is excessive. However, if heartbeats are recorded more frequently or the limit is increased, this could cause memory pressure.
- **Fix:** Use a SQL window function (LAG) to detect gaps in the database instead of loading rows into memory.

---

## LOW

### L1: `getDbNowUncached` Still Called Inside `withPgAdvisoryLock` Transaction
- **File:** `src/lib/realtime/realtime-coordination.ts:68-73, 94`
- **Confidence:** Medium
- **Description:** `withPgAdvisoryLock` wraps operations in a transaction, and `acquireSharedSseConnectionSlot` calls `getDbNowUncached()` inside that transaction (line 94). This extends the advisory lock hold time by one extra DB round-trip. While advisory locks are lightweight, under very high SSE connection churn this adds latency.
- **Fix:** Pass the timestamp into `withPgAdvisoryLock` or call `getDbNowUncached` before entering the transaction.

### L2: Audit-Logs Instructor Scope Requires N+1 Queries
- **File:** `src/app/api/v1/admin/audit-logs/route.ts:74-105`
- **Confidence:** Low
- **Description:** For instructor-scoped audit log views, the code performs up to 4 sequential queries (groups -> assignments -> submissions -> problems) to build the scope filter. Each depends on the previous result. This is O(N) in the number of owned resources.
- **Fix:** Use a single CTE query or denormalize the ownership relationships.

---

## Final Sweep Notes

- The cycle-5 fix (moving `getDbNowUncached` out of judge/poll transactions) is correctly applied.
- Compiler execution limiter (`pLimit`) properly caps concurrent Docker containers.
- No memory leaks detected in connection tracking Maps.
