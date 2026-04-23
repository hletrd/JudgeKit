# RPF Cycle 1 — Critic

**Date:** 2026-04-22
**Base commit:** b1271d6a
**Reviewer:** critic

## Inventory of Reviewed Files

- All files in working tree diff
- `src/components/contest/contest-quick-stats.tsx`
- `src/components/submission-list-auto-refresh.tsx`
- `src/components/contest/recruiting-invitations-panel.tsx`
- `src/app/api/v1/contests/[assignmentId]/stats/route.ts`
- `src/hooks/use-visibility-polling.ts`
- `src/components/exam/anti-cheat-monitor.tsx`
- `src/components/contest/leaderboard-table.tsx`

## Findings

### CRI-1: Working tree changes are solid but several AGG items from the plan remain unimplemented [MEDIUM/HIGH]

**Description:** The plan in `plans/open/2026-04-22-rpf-cycle-1-review-remediation.md` lists 9 tasks. Working tree implements TASK-1, TASK-2, TASK-3, TASK-5. Remaining unimplemented:
- TASK-4: leaderboard-table formatScore (LOW)
- TASK-6: useVisibilityPolling jitter (MEDIUM)
- TASK-7: anti-cheat setInterval (LOW)
- TASK-8: json-ld.tsx escape (LOW)
- TASK-9: recruiting-invitations split fetchData (LOW)

The HIGH-priority items (1, 2, 3) are done. TASK-6 is MEDIUM priority and should be addressed this cycle.

### CRI-2: `formatScore` / `formatNumber` inconsistency is a systemic issue [MEDIUM/MEDIUM]

**Description:** The codebase has `formatScore` and `formatNumber` in `src/lib/formatting.ts`, but 6+ locations still use `Math.round(score * 100) / 100`. This suggests the utility was added after the initial code was written, and there was no sweep to update existing call sites. The working tree fixes for `contest-quick-stats.tsx` correctly use `formatNumber`, but the broader inconsistency remains.

**Fix:** Do a one-time sweep of all `Math.round(.*\* 100\)` patterns in components and replace with `formatScore`.

### CRI-3: Inconsistent polling error handling pattern [MEDIUM/MEDIUM]

**Description:** Three of the four polling components now use `initialLoadDoneRef` (announcements, clarifications, quick-stats). Leaderboard uses a different pattern (error state + retry button). This inconsistency means new polling components have no single pattern to follow.

**Fix:** Consolidate into the `useVisibilityPolling` hook.

## Summary

| ID | Severity | Confidence | Description |
|----|----------|------------|-------------|
| CRI-1 | MEDIUM | HIGH | 5 plan tasks remain unimplemented (TASK-4,6,7,8,9) |
| CRI-2 | MEDIUM | MEDIUM | formatScore/formatNumber inconsistency is systemic (6+ locations) |
| CRI-3 | MEDIUM | MEDIUM | Inconsistent polling error handling across components |
