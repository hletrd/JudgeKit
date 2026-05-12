# User-injected TODOs for Cycle 3

## TODO-1: Wrap 8 parallel DB queries in transaction (C2-AGG-6)

**Source finding:** C2-AGG-6 from cycle 2 aggregate review
**File:** `src/lib/assignments/participant-timeline.ts:94-184`
**Severity:** MEDIUM | Confidence: High
**Original reporter:** perf-reviewer

**Problem:** The `getParticipantTimeline` function fires 8 parallel DB queries (`db.select().from()`) via `Promise.all` without wrapping them in a transaction. If any query fails or if data changes between queries, the timeline data becomes inconsistent.

**Suggested fix:** Wrap the parallel queries in `db.transaction(async (tx) => { ... })` and use `tx` instead of `db` for all queries. This ensures atomicity and consistency.

**Exit criterion:** All 8 queries use the same transaction context.

---

*Injected by orchestrator on 2026-05-12 because cycle 2's remediation plan missed this finding.*
