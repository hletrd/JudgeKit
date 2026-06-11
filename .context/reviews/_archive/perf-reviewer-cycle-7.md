# Performance Review — Cycle 7

**Reviewer:** perf-reviewer (orchestrator direct)
**Date:** 2026-05-11
**Scope:** Performance audit of SSE polling, DB queries, compiler execution, and anti-cheat gap detection

---

## New Findings

### LOW

#### C7-PERF-1: `getDbNowUncached` Still Called Inside Advisory Lock Transaction
- **File:** `src/lib/realtime/realtime-coordination.ts:68-73, 94`
- **Confidence:** High
- **Description:** `getDbNowUncached()` executes a separate DB query inside `withPgAdvisoryLock` transactions. The advisory lock is held for the duration of the transaction. Adding an extra round-trip query extends lock duration, increasing contention for concurrent SSE connection acquisitions.
- **Fix:** Call `getDbNowUncached()` before entering the transaction, passing the timestamp as a parameter.

---

## Unfixed from Prior Cycles

#### M1: SSE `sharedPollTick` Unbounded `inArray` Query (Cycle 6)
- **File:** `src/app/api/v1/submissions/[id]/events/route.ts:224-232`
- **Confidence:** High
- **Description:** The shared poll tick collects ALL active submission IDs and queries them in a single `inArray(submissions.id, submissionIds)` query. With 500 concurrent SSE connections, this creates an IN clause with 500 IDs. PostgreSQL performance degrades with large IN lists.
- **Fix:** Query by status (`WHERE status IN ('pending', 'queued', 'judging')`) with a reasonable LIMIT instead of by ID list, or batch into chunks of 100.

#### L7: Anti-Cheat Heartbeat Gap Detection Loads 5000 Rows into Memory (Cycle 6)
- **File:** `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:199-227`
- **Confidence:** Medium
- **Description:** Gap detection fetches 5000 heartbeat rows into memory. For long contests, this could cause memory pressure if many instructors query gap detection simultaneously.
- **Fix:** Use a windowed SQL query to detect gaps directly in the database rather than loading rows into application memory.

#### L9: Audit-Logs Instructor Scope Requires N+1 Queries (Cycle 6)
- **File:** `src/app/api/v1/admin/audit-logs/route.ts:74-105`
- **Confidence:** Low
- **Description:** Instructor scope builds by querying groups, then assignments, then submissions, then problems in sequence. These could be batched or joined.
- **Fix:** Use a single CTE or joined query to resolve all scoped resources in one round-trip.

---

## No Agent Failures

All review work performed directly by the orchestrator due to absence of registered Agent tools in this environment.
