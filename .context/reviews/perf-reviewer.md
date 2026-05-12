# Performance Reviewer — Cycle 3 Review

## C3-PERF-1: 8 sequential round-trips without transaction batching

**File:** `src/lib/assignments/participant-timeline.ts:94-184`
**Severity:** MEDIUM | Confidence: High

Even though the 8 queries run in parallel via `Promise.all`, each opens its own separate query execution on the PostgreSQL server. Without a transaction wrapper, PostgreSQL must process 8 independent query plans and result sets. Wrapping in a transaction allows the database to potentially optimize and provides snapshot isolation at the cost of a single BEGIN/COMMIT pair.

**Fix:** Wrap in `db.transaction(async (tx) => { ... })`.

---

## C3-PERF-2: LRU cache background refresh has unbounded concurrency risk

**File:** `src/lib/assignments/contest-scoring.ts:121-145`
**Severity:** LOW | Confidence: Medium

The stale-while-revalidate pattern uses `_refreshingKeys` to prevent multiple concurrent refreshes for the same cache key, but under high load with many distinct assignment IDs, each key can trigger its own background refresh concurrently. With 50 cached entries (LRU max), that's potentially 50 concurrent background DB queries.

**Fix:** Consider a global concurrency limit for background refreshes, or increase the stale threshold to reduce refresh frequency.

---

## C3-PERF-3: `getActiveTimedAssignments` fetches all contests then filters

**File:** `src/lib/assignments/active-timed-assignments.ts:56-64`
**Severity:** LOW | Confidence: Medium

`getContestsForUser` likely fetches all contests visible to the user, then `selectActiveTimedAssignments` filters them in memory. For users with access to many contests, this transfers unnecessary data from the DB.

**Fix:** Push the active/time-filtered logic into the database query where possible.
