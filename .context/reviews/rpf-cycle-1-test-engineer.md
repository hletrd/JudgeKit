# RPF Cycle 1 — Test Engineer

**Date:** 2026-04-22
**Base commit:** b1271d6a
**Reviewer:** test-engineer

## Inventory of Reviewed Files

- `src/components/contest/contest-quick-stats.tsx`
- `src/components/submission-list-auto-refresh.tsx`
- `src/hooks/use-visibility-polling.ts`
- `src/components/exam/anti-cheat-monitor.tsx`
- `src/app/api/v1/contests/[assignmentId]/stats/route.ts`
- All test files in the project

## Findings

### TE-1: No unit tests for `useVisibilityPolling` [MEDIUM/MEDIUM]

**File:** `src/hooks/use-visibility-polling.ts`

**Description:** This shared hook is used by 4 components but has no unit tests. Any regression would affect all dependent components. The hook manages visibility state, interval creation/cleanup, and callback stabilization.

**Fix:** Add unit tests covering: initial tick, interval creation, cleanup on unmount, visibility transitions (visible->hidden->visible), callback update without re-triggering effect.

### TE-2: No unit tests for `SubmissionListAutoRefresh` [MEDIUM/MEDIUM]

**File:** `src/components/submission-list-auto-refresh.tsx`

**Description:** This component has complex backoff behavior with concurrent tick guards, visibility checks, and error counting. No unit tests exist.

**Fix:** Add unit tests covering: initial tick and scheduling, backoff escalation on errors, reset on success, visibility-aware behavior, concurrent tick guard.

### TE-3: No unit tests for new stats API endpoint [MEDIUM/MEDIUM]

**File:** `src/app/api/v1/contests/[assignmentId]/stats/route.ts`

**Description:** The new stats endpoint has no API route tests. It involves complex SQL queries with CTEs, access control checks, and multiple query paths. This is a new file that should have test coverage.

**Fix:** Add API route tests covering: authenticated access, instructor access, enrolled student access, unauthenticated denial, response shape validation.

### TE-4: No integration test for `contest-quick-stats` with the stats endpoint [LOW/MEDIUM]

**File:** `src/components/contest/contest-quick-stats.tsx`

**Description:** The component was refactored to use a new `/stats` endpoint instead of the leaderboard. No test verifies the integration works end-to-end.

## Summary

| ID | Severity | Confidence | Description |
|----|----------|------------|-------------|
| TE-1 | MEDIUM | MEDIUM | No unit tests for useVisibilityPolling |
| TE-2 | MEDIUM | MEDIUM | No unit tests for SubmissionListAutoRefresh |
| TE-3 | MEDIUM | MEDIUM | No unit tests for new stats API endpoint |
| TE-4 | LOW | MEDIUM | No integration test for contest-quick-stats with stats endpoint |
