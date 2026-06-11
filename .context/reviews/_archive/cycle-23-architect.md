# Cycle 23 Architect Review

**Date:** 2026-04-20
**Base commit:** bb6f3fc2

## Findings

### ARCH-1: Inconsistent polling patterns across components -- no shared hook [MEDIUM/MEDIUM]

**Files:** `src/components/contest/leaderboard-table.tsx:243-256`, `src/components/contest/contest-quick-stats.tsx:81-112`, `src/components/contest/contest-clarifications.tsx:87-111`, `src/components/contest/contest-announcements.tsx:71-95`, `src/app/(dashboard)/dashboard/admin/workers/workers-client.tsx:242-265`, `src/components/submission-list-auto-refresh.tsx`
**Description:** There are at least 6 components implementing polling with visibility-aware pausing. Each one implements the pattern slightly differently:
- `leaderboard-table.tsx`: fires interval regardless, checks visibility in callback (the "fire but skip" anti-pattern)
- `contest-quick-stats.tsx`, `contest-clarifications.tsx`, `contest-announcements.tsx`: pause/resume the interval on visibility change
- `workers-client.tsx`: same pause/resume pattern but slightly different structure
- `submission-list-auto-refresh.tsx`: its own separate implementation

This is a DRY violation at the architectural level. A shared `usePolling` or `useVisibilityAwareInterval` hook would ensure consistent behavior and make it trivial to add future enhancements (e.g., exponential backoff, stale-while-revalidate).
**Concrete failure scenario:** A bug is discovered in the visibility-based pausing logic. It must be fixed in 6 separate places instead of one. During the fix, one component is missed.
**Fix:** Extract a `useVisibilityAwarePolling(callback, intervalMs)` custom hook that encapsulates the pause/resume pattern. Migrate all 6 components to use it.
**Confidence:** MEDIUM

### ARCH-2: AppSidebar "Learning" section has only one item ("Problems") -- stale group label [LOW/LOW]

**Files:** `src/components/layout/app-sidebar.tsx:56-70`
**Description:** After the workspace-to-public migration removed Submissions, Contests, Rankings, and Compiler from the sidebar (they are in the PublicHeader dropdown or top nav), the "Learning" group in AppSidebar contains only "Problems". A single-item group with a group label ("Learning") adds visual noise without organizational benefit.
**Concrete failure scenario:** A user sees the sidebar with "Learning" heading and only one item underneath it. The group label implies more items should be there, which is confusing.
**Fix:** Either remove the "Learning" group label (render the single item without a group heading) or merge "Problems" into the "Manage" group.
**Confidence:** LOW

## Verified Safe

- Navigation is properly centralized via shared `public-nav.ts`.
- The workspace-to-public migration has been executed correctly: no `/workspace` references remain, `(control)` group merged.
- PublicHeader and AppSidebar use consistent capability-based filtering.
- Route redirects for `/dashboard/rankings`, `/dashboard/languages`, `/dashboard/compiler` are in place.
- Dashboard layout correctly includes PublicHeader via `leadingSlot` pattern.
