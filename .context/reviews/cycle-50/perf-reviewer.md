# Cycle 50 — Performance Reviewer

**Date:** 2026-05-13
**HEAD reviewed:** `898684e6`
**Prior aggregate:** `_aggregate-cycle-49.md` (HEAD `17a35892`)

## Scope
Performance review of changes since cycle 49. Focused on database queries, caching, parallelism, and transaction scope.

---

## NEW Findings

### C50-PR-1: participant-timeline.ts loses query parallelism
- **Severity:** LOW
- **Confidence:** MEDIUM
- **File:** `src/lib/assignments/participant-timeline.ts:94-185`
- **Problem:** The function was changed from `Promise.all([...8 parallel queries...])` to `db.transaction(async (tx) => Promise.all([...8 queries using tx...]))`. While transactions provide consistency, PostgreSQL transactions serialize queries within the same connection. The previous parallel execution on separate connections was faster.
- **Impact:** For admin timeline views with heavy data, response time may increase. However, LIMITs (5000 submissions, 1000 snapshots) cap the data volume.
- **Fix:** Consider using read-only transaction with `SET TRANSACTION ISOLATION LEVEL READ COMMITTED` and measuring if the parallelism loss is significant. Alternatively, keep the transaction but use `Promise.all` so queries execute concurrently (PostgreSQL supports concurrent queries within a transaction if the driver sends them pipelined).

### C50-PR-2: Cache invalidation fire-and-forget pattern
- **Severity:** LOW
- **Confidence:** LOW
- **File:** `src/app/api/v1/judge/poll/route.ts:186-193`, `src/app/api/v1/submissions/[id]/rejudge/route.ts:57-63`, `src/app/api/v1/admin/submissions/rejudge/route.ts:78-82`
- **Problem:** `invalidateRankingCache()` is triggered via `Promise.resolve().then()` without await. If the server process crashes between transaction commit and cache invalidation, stale cache data persists until TTL (30s).
- **Impact:** Very low — cache TTL is short, and the scenario requires a crash in a narrow window.
- **Fix:** Acceptable as-is. For higher stakes, use a background job queue for cache invalidation.

### C50-PR-3: `getDbNowUncached` called outside transactions
- **Severity:** N/A (positive finding)
- **Confidence:** HIGH
- **Observation:** Multiple fixes moved `getDbNowUncached()` calls outside transaction blocks (submissions route, exam-sessions, access-codes). This reduces transaction hold time and avoids unnecessary raw queries inside transactions. Good performance improvement.

---

## Carry-forward
- No performance regressions introduced.
- `@types/node` bumped from 20 to 25 — should have no runtime impact.
