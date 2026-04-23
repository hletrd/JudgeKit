# RPF Cycle 17 — Performance Reviewer Report

**Date:** 2026-04-20
**Reviewer:** perf-reviewer
**Base commit:** HEAD (2af713d3)

---

## PERF-1: Public problem detail page makes 7+ sequential DB queries — slow page load for complex problems [MEDIUM/MEDIUM]

**Files:** `src/app/(public)/practice/problems/[id]/page.tsx:99-214`
**Description:** The page component executes the following queries sequentially (not all parallelized):
1. `getTranslations` x4 + `auth()` + `getLocale()` — parallelized via Promise.all (line 101)
2. `resolveCapabilities` (line 110) — sequential
3. `db.query.problems.findFirst` (line 112) — sequential
4. `getResolvedSystemTimeZone` (line 126) — sequential
5. `getResolvedSystemSettings` (line 127) — sequential
6. `db.select().from(languageConfigs)` (line 131) — sequential
7. `listProblemDiscussionThreads` (line 146) — sequential
8. `listProblemSolutionThreads` (line 147) — sequential
9. `listProblemEditorials` (line 148) — sequential
10. Stats query (line 151) — sequential
11. Similar problems query (line 168) — conditional sequential
12. prev/next problem queries (line 192) — parallel with each other
13. User submissions query (line 230) — conditional sequential

Queries 4-10 could be parallelized since they don't depend on each other's results (they all depend on `problem.id` which is available after query 3). Similarly, queries 11-12 could be parallelized with 10.

**Concrete failure scenario:** A public problem page takes 500ms+ to load because 7+ DB queries run sequentially instead of in parallel.
**Fix:** After the problem lookup (query 3), group independent queries into `Promise.all` calls. For example: queries 4-10 can all run in parallel since they only need `problem.id`, `session`, and `locale`. The stats, similar problems, and prev/next queries can also be parallelized with the discussion/editorial queries.
**Confidence:** MEDIUM

---

## PERF-2: `generateMetadata` also fetches problem data independently — not cached with page component [LOW/MEDIUM]

**Files:** `src/app/(public)/practice/problems/[id]/page.tsx:37-97`
**Description:** `generateMetadata` runs its own `db.query.problems.findFirst` query (line 40) separate from the page component's query (line 112). While Next.js should invoke both within the same request (allowing `React.cache()` to deduplicate), this only works if the exact same query parameters are used. The metadata query selects fewer columns (`columns: { title, description, visibility, ... }`) while the page query selects all columns (no `columns` restriction). This means `React.cache()` cannot deduplicate them — they are different function calls with different parameters.

**Concrete failure scenario:** Every problem page load makes 2 separate DB queries for the same problem (one for metadata, one for rendering), wasting a DB connection and adding latency.
**Fix:** Use `React.cache()` to wrap a shared problem lookup, or restructure the metadata query to include all columns needed by the page component so `React.cache()` can deduplicate.
**Confidence:** MEDIUM

---

## PERF-3: Workers page polls every 10 seconds unconditionally — unnecessary load when tab is backgrounded [LOW/LOW]

**Files:** `src/app/(dashboard)/dashboard/admin/workers/workers-client.tsx:254`
**Description:** `setInterval(fetchData, 10_000)` runs every 10 seconds regardless of whether the tab is visible. When an admin has the workers page open in a background tab, it continues to make API requests every 10 seconds. This wastes server resources and network bandwidth.

**Fix:** Use `document.visibilityState` or the `visibilitychange` event to pause polling when the tab is not visible. Resume polling when the tab becomes visible again.
**Confidence:** LOW

---

## Verified Safe

- SSE connection tracking is bounded by MAX_TRACKED_CONNECTIONS (1000)
- Contest replay uses pLimit(2) for DB connection pool conservation
- Timer cleanup is properly handled across components
