# Performance Reviewer — RPF Cycle 18

**Date:** 2026-04-20
**Base commit:** 2b415a81

## PERF-1: Practice page progress-filter path fetches all matching problem IDs for in-JS filtering [MEDIUM/MEDIUM]

**File:** `src/app/(public)/practice/page.tsx:417-437`
**Description:** When a progress filter (solved/unsolved/attempted) is active, Path B fetches ALL matching problem IDs from the database (line 417-423), then fetches ALL user submissions for those problems (line 428-437), filters in JavaScript (lines 439-445), and only then paginates. The code has a comment acknowledging this: "For large problem sets (10k+), this should be moved to a SQL CTE or subquery for better performance."
**Concrete failure scenario:** With 10,000+ public problems and a user who has submitted to many, this path could take several seconds, as it loads all problem IDs and all user submission records into memory before filtering.
**Fix:** Move the progress filter logic into a SQL CTE or subquery so pagination stays in the database.

## PERF-2: Public problem detail page makes 3 sequential query rounds — could be 2 [LOW/LOW]

**File:** `src/app/(public)/practice/problems/[id]/page.tsx:112-154,179-259`
**Description:** The page first fetches the problem (line 112-120), then in parallel fetches stats/languages/threads/etc. (line 127-154), then in a third round fetches similar problems + navigation + user submissions (line 179-259). The third round could be parallelized with the second since the problem ID is already known from the first query.
**Concrete failure scenario:** Minor latency on problem detail pages — the third batch of queries waits for the second batch to complete unnecessarily.
**Fix:** Merge the second and third `Promise.all` into a single `Promise.all` since both only depend on the problem lookup result.

## Verified Safe

- DB query parallelization on the public problem detail page was improved in commit 07c1c854 — stats, languages, threads, and editorials are already fetched in a single `Promise.all`.
- The practice page submission stats subquery is shared across sort modes efficiently.
- SSE shared polling uses a single batch query for all active submission IDs.
- SSE connection tracking eviction is O(n) but bounded by cap of 1000 — acceptable.
