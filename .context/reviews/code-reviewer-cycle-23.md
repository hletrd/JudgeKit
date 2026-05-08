# Code Reviewer — Cycle 23

**Date:** 2026-04-24
**Scope:** Full repository deep review

---

## CR-1: [MEDIUM] SSE cleanup timer runs module-level side effect on import — multiple timer registration

**Confidence:** HIGH
**Citations:** `src/app/api/v1/submissions/[id]/events/route.ts:101-115`

The `setInterval` at line 102 runs at module load time. In development with HMR, this module can be re-evaluated multiple times, each time creating a new timer. While the code clears the previous timer via `clearInterval(globalThis.__sseCleanupTimer)`, this is a fragile pattern that depends on the global variable being updated before the next HMR cycle. If HMR loads the module twice in parallel (possible with Next.js turbopack), two timers could be registered.

**Concrete failure scenario:** In development with turbopack, two concurrent HMR evaluations each read `globalThis.__sseCleanupTimer` as the same old value, both clear it, both set new intervals. One interval is orphaned and never cleared.

**Fix:** Use a singleton pattern that checks-and-sets atomically, or move the timer initialization into the GET handler's first invocation.

---

## CR-2: [LOW] SSE `addConnection` eviction scans entire map when near capacity

**Confidence:** MEDIUM
**Citations:** `src/app/api/v1/submissions/[id]/events/route.ts:44-55`

When `connectionInfoMap.size >= MAX_TRACKED_CONNECTIONS` (1000), the eviction loop iterates all entries to find the oldest. Under load with many simultaneous connections, this is O(n) on each new connection.

**Concrete failure scenario:** A burst of 50 new SSE connections at the same time when the tracking map is near capacity. Each new connection triggers a full scan of 1000 entries, costing ~50x1000 = 50,000 iterations total.

**Fix:** Maintain a min-heap or sorted structure for oldest-first eviction, or accept the current O(n) as amortized since MAX_TRACKED_CONNECTIONS is only 1000.

---

## CR-3: [LOW] `importDatabase` silently maps column names by position — schema drift risk

**Confidence:** MEDIUM
**Citations:** `src/lib/db/import.ts:163-168`

The import loop maps `columns[j]` to `row[j]` by position. If the export was produced by a version with a different column order in `TABLE_ORDER` or a different Drizzle schema, the column names in `columns[]` may not match the target schema's column names, leading to silent data corruption.

**Concrete failure scenario:** An admin exports from JudgeKit v0.1 (where `users` has columns `[id, name, email]`) and imports into v0.2 (where `users` has columns `[id, email, name]` due to a schema migration). The import writes `name` data into the `email` column and vice versa without any error.

**Fix:** Add a column-name validation step that verifies the exported column names match the target schema's column names before inserting. If there is a mismatch, report the drift rather than silently corrupting data.

---

## CR-4: [LOW] `sanitizeSubmissionForViewer` performs hidden DB query without caching

**Confidence:** MEDIUM
**Citations:** `src/lib/submissions/visibility.ts:90-99`

When `assignmentVisibility` is not provided and the submission has an `assignmentId`, the function queries the `assignments` table. This is documented, but in bulk contexts (e.g., submission list pages), this can cause N+1 queries. The comment acknowledges this but the API does not enforce the bulk path.

**Fix:** Consider making the `assignmentVisibility` parameter required in bulk contexts, or add a batch pre-fetch helper.

---

## Summary

- Total findings: 4
- MEDIUM/HIGH: 1 (CR-1)
- LOW: 3 (CR-2, CR-3, CR-4)
