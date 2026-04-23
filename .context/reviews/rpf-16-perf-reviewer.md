# RPF Cycle 16 — Performance Reviewer

**Date:** 2026-04-20
**Base commit:** 58da97b7

## Findings

### PERF-1: Public problem detail page issues 6-7 independent DB queries sequentially in the main data fetch [MEDIUM/MEDIUM]

- **File:** `src/app/(public)/practice/problems/[id]/page.tsx:111-213`
- **Description:** The `PublicProblemDetailPage` component executes multiple DB queries sequentially: (1) problem + tags query, (2) language configs, (3) discussion threads, (4) solution threads, (5) editorials, (6) stats, (7) similar problems, (8) prev/next problem nav. While some depend on the problem query result, several (language configs, stats, similar problems with pre-known tag IDs) could be parallelized. The initial `Promise.all` at line 101-108 only covers translations, session, and locale — the heavy DB work at lines 111-213 is sequential.
- **Concrete failure scenario:** A problem detail page with many tags and discussion threads could take 200-400ms due to sequential queries where 100-150ms could be saved by parallelizing independent queries.
- **Fix:** Wrap independent DB queries in a `Promise.all` after the problem query resolves. For example, `[threads, solutionThreads, editorials, statsRow, similarProblems] = await Promise.all([...])`.
- **Confidence:** MEDIUM

### PERF-2: `streamBackupWithFiles` memory buffering (carry from rpf-13, rpf-14, rpf-15) [MEDIUM/HIGH]

- **File:** `src/lib/db/export-with-files.ts:120-131`
- **Description:** Carry-over from rpf-13/14/15. The backup-with-files path collects the entire database export JSON into memory before creating the ZIP. Short-term mitigation (warning log for large exports) not yet implemented.
- **Fix:** Short-term: add warning log. Long-term: migrate to streaming ZIP library.
- **Confidence:** HIGH (previously confirmed)

## Verified Safe

- DB time is fetched once per route handler (`getDbNowUncached()`) — no redundant round-trips in recruiting invitation routes.
- No N+1 query patterns detected in the recruiting invitation or API key modules.
- Pagination is properly implemented for list endpoints.
