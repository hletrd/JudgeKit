# Performance Review — RPF Cycle 19 (Updated)

**Date:** 2026-04-22
**Reviewer:** perf-reviewer
**Base commit:** 6df94cb1

## Previous Findings Status

| ID | Finding | Status |
|----|---------|--------|
| PERF-1 | Practice page Path B fetches all into memory | DEFERRED (requires SQL CTE) |
| PERF-2 | SubmissionListAutoRefresh no backoff | FIXED (errorCountRef + exponential backoff added) |

## New Findings

### PERF-3: `SubmissionOverview` polls every 5s even when dialog is closed — `useVisibilityPolling` paused flag mitigates but not fully [LOW/MEDIUM]

**File:** `src/components/lecture/submission-overview.tsx:123`

**Description:** The component passes `!open` as the `paused` flag to `useVisibilityPolling`, which should prevent fetching when the dialog is closed. However, the `fetchStats` callback itself also checks `if (!openRef.current) return;` as a guard. This double-guard is correct behavior. The issue is that when `open` toggles from `false` to `true`, the `initialLoadDoneRef` is reset (line 129), which means the first visible fetch after re-opening will show an error toast if it fails. This is intentional UX but worth noting.

**Concrete failure scenario:** User rapidly toggles the submission overview dialog. Each open triggers a new fetch with a fresh `initialLoadDoneRef`, potentially showing error toasts on network issues.

**Fix:** Consider a debounce on the open state change to avoid rapid toggle-triggered fetches. Low priority — the current behavior is acceptable.

---

### PERF-4: No new performance regressions found [INFO/N/A]

**Description:** Recent improvements:
- `SubmissionListAutoRefresh` now has exponential backoff with `errorCountRef`
- Contest quick stats, clarifications, and announcements use `AbortController` for request cancellation
- Anti-cheat timeline uses shallow comparison to skip unnecessary re-renders
- Sidebar timer has visibilitychange listener
