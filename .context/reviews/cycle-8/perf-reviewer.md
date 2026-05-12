# Performance Review — Cycle 8/100

**Date:** 2026-05-11
**HEAD:** main / 05752cdb
**Reviewer:** perf-reviewer

---

## Findings

### P1 — MEDIUM — SSE shared poll still uses unbounded `inArray` query

- **File:** `src/app/api/v1/submissions/[id]/events/route.ts:224-232`
- **Description:** The `sharedPollTick` function collects ALL active submission IDs from `submissionSubscribers` and queries them with `inArray(submissions.id, submissionIds)`. With 500 concurrent SSE connections, this creates an IN clause with 500 IDs. PostgreSQL query performance degrades with large IN lists, and the query plan may switch to a suboptimal nested loop. This was deferred in cycle 7.
- **Confidence:** HIGH
- **Suggested fix:** Query by status (`WHERE status IN ('pending', 'queued', 'judging')`) with a reasonable LIMIT instead of by ID list.

### P2 — LOW — `getDbNowUncached()` correctly moved out of advisory locks

- **File:** `src/lib/realtime/realtime-coordination.ts:93,166`
- **Description:** Verified that cycle 7 fix is correctly implemented. `getDbNowUncached()` is now called BEFORE `withPgAdvisoryLock` in both `acquireSharedSseConnectionSlot` and `shouldRecordSharedHeartbeat`. This reduces lock hold duration by one DB round-trip.
- **Confidence:** HIGH
- **Status:** Fix verified.

### P3 — LOW — Anti-cheat heartbeat gap detection loads 5000 rows

- **File:** `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:199-208`
- **Description:** The gap detection query fetches up to 5000 heartbeat rows into memory. This covers ~83 hours at 60-second intervals. For typical contests this is sufficient, but very long contests (e.g., 7-day hackathons) could exceed this limit. This was deferred in cycle 7.
- **Confidence:** MEDIUM

---

## Verified Fixes from Prior Cycles

- Cycle 7 Task 2 (getDbNowUncached out of lock): correctly implemented
- Cycle 7 Task 4 (anti-cheat early check): correctly moved before enrollment checks, reducing DB queries for disabled anti-cheat assignments
