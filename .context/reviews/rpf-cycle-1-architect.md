# RPF Cycle 1 — Architect

**Date:** 2026-04-22
**Base commit:** b1271d6a
**Reviewer:** architect

## Inventory of Reviewed Files

- `src/components/contest/contest-quick-stats.tsx`
- `src/components/submission-list-auto-refresh.tsx`
- `src/hooks/use-visibility-polling.ts`
- `src/components/contest/contest-announcements.tsx`
- `src/components/contest/contest-clarifications.tsx`
- `src/components/contest/leaderboard-table.tsx`
- `src/app/api/v1/contests/[assignmentId]/stats/route.ts`
- `src/lib/formatting.ts`

## Findings

### ARCH-1: Inconsistent error handling across polling components [MEDIUM/MEDIUM]

**File:** Multiple: `contest-announcements.tsx`, `contest-clarifications.tsx`, `contest-quick-stats.tsx`, `leaderboard-table.tsx`, `use-visibility-polling.ts`

**Description:** Four components, four different error-handling strategies for polling errors:
- Announcements: `initialLoadDoneRef` pattern (toast only on initial load)
- Clarifications: `initialLoadDoneRef` pattern (toast only on initial load)
- Quick-stats: `initialLoadDoneRef` pattern (now fixed in working tree)
- Leaderboard: silently swallow errors during refresh, show error state on initial load

The `initialLoadDoneRef` pattern is duplicated in 3 components. The hook itself doesn't know about error handling.

**Fix:** Extend `useVisibilityPolling` to accept an `onError` callback with `isInitialLoad` parameter. Update all consumers.

### ARCH-2: `Math.round` vs `formatScore` inconsistency across the codebase [LOW/MEDIUM]

**Files:** `leaderboard-table.tsx:200,428`, `submission-status-badge.tsx:89`, `practice/problems/[id]/page.tsx:523`, `contests/[id]/page.tsx:229,266`

**Description:** The `formatScore` utility exists in `src/lib/formatting.ts` but is not used consistently. 6 locations still use `Math.round(score * 100) / 100`. This is a code architecture issue: the utility exists but there's no linter rule or convention enforcing its use.

**Fix:** Replace all 6 occurrences with `formatScore`. Consider adding a code comment or ESLint rule to prevent raw score rounding.

## Summary

| ID | Severity | Confidence | Description |
|----|----------|------------|-------------|
| ARCH-1 | MEDIUM | MEDIUM | Inconsistent error handling in polling components |
| ARCH-2 | LOW | MEDIUM | Math.round vs formatScore inconsistency (6 locations) |
