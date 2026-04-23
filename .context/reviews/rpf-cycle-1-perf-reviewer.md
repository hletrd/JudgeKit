# RPF Cycle 1 — Performance Reviewer

**Date:** 2026-04-22
**Base commit:** b1271d6a
**Reviewer:** perf-reviewer

## Inventory of Reviewed Files

- `src/components/contest/contest-quick-stats.tsx`
- `src/components/submission-list-auto-refresh.tsx`
- `src/hooks/use-visibility-polling.ts`
- `src/components/exam/anti-cheat-monitor.tsx`
- `src/components/contest/leaderboard-table.tsx`
- `src/app/api/v1/contests/[assignmentId]/stats/route.ts`
- `src/components/contest/recruiting-invitations-panel.tsx`

## Findings

### PERF-1: `useVisibilityPolling` triggers simultaneous API calls on visibility change [MEDIUM/MEDIUM]

**File:** `src/hooks/use-visibility-polling.ts:40-44`

**Description:** When the page becomes visible, all 4 components using this hook (announcements, clarifications, leaderboard, quick-stats) fire their callbacks simultaneously. This creates a burst of API calls on tab switch. Previously the quick-stats also fetched the full leaderboard, but the new stats endpoint is much lighter (~200 bytes vs ~50KB), so this is significantly less impactful now.

**Fix:** Add a small random jitter (0-500ms) to the initial tick after visibility change.

### PERF-2: `recruiting-invitations-panel.tsx` fetches stats on every filter/search change [LOW/MEDIUM]

**File:** `src/components/contest/recruiting-invitations-panel.tsx:111-135`

**Description:** `fetchData` fetches both invitations and stats in parallel on every filter/search change. Stats don't change when the search query changes, only after mutations.

**Fix:** Split into `fetchInvitations` and `fetchStats`, only refetch stats after create/revoke/delete.

### PERF-3: Stats API route runs 3 separate SQL queries [LOW/LOW]

**File:** `src/app/api/v1/contests/[assignmentId]/stats/route.ts:62-106`

**Description:** The stats endpoint runs 3 separate SQL queries: participant count, submission stats, and solved problems. These could theoretically be combined into a single query, but the current approach is simple and the endpoint is called every 15s. The queries are lightweight (indexes on assignment_id), so the overhead of 3 round-trips is acceptable for now.

**Confidence:** Low — optimization would add SQL complexity for marginal gain.

## Summary

| ID | Severity | Confidence | Description |
|----|----------|------------|-------------|
| PERF-1 | MEDIUM | MEDIUM | Visibility polling triggers simultaneous API calls across components |
| PERF-2 | LOW | MEDIUM | Recruiting invitations refetches stats on every filter change |
| PERF-3 | LOW | LOW | Stats API runs 3 separate SQL queries (acceptable) |
