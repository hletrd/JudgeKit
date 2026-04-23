# Performance Review — RPF Cycle 19

**Date:** 2026-04-20
**Reviewer:** perf-reviewer
**Base commit:** 77da885d

## Findings

### PERF-1: Practice page Path B still fetches all matching problem IDs + all user submissions into memory — no change since cycle 18 [MEDIUM/MEDIUM]

**Files:** `src/app/(public)/practice/page.tsx:410-519`
**Description:** This was identified in cycle 18 (AGG-3) and remains unfixed. When a progress filter (solved/unsolved/attempted) is active, Path B fetches ALL matching problem IDs, then ALL user submissions for those problems, filters in JavaScript, and paginates. The code has a comment acknowledging this should be moved to SQL. At current scale this may be acceptable, but it is a growing risk.
**Concrete failure scenario:** With 10,000+ public problems and a user who has submitted to many of them, this path could take several seconds and consume significant server memory.
**Fix:** Move the progress filter logic into a SQL CTE or subquery using a `HAVING` clause on the aggregated submission statuses. This eliminates the in-JS filtering and the need to fetch all IDs into memory.

### PERF-2: `SubmissionListAutoRefresh` polls at fixed intervals without exponential backoff or error handling [LOW/LOW]

**Files:** `src/components/submission-list-auto-refresh.tsx:22-28`
**Description:** The auto-refresh component calls `router.refresh()` on a fixed interval (5s active, 10s idle). If the server starts returning errors or is slow, the polling continues at the same rate, potentially worsening server load. There is no error handling or backoff mechanism.
**Concrete failure scenario:** During a server overload, 100 users on the submissions page generate 20 requests/second each, compounding the load issue.
**Fix:** Add error-state tracking and switch to a longer interval when consecutive refreshes fail. Reset to the fast interval on success.
