# Cycle 23 Performance Reviewer

**Date:** 2026-04-20
**Base commit:** bb6f3fc2

## Findings

### PERF-1: `leaderboard-table.tsx` interval does not pause on tab visibility change [LOW/LOW]

**Files:** `src/components/contest/leaderboard-table.tsx:243-256`
**Description:** The leaderboard's polling `setInterval` continues to fire every `refreshInterval` ms even when the tab is hidden. Inside the callback, it checks `document.visibilityState === "visible"` before making the API call, which avoids the network request but does not avoid the timer overhead. Other components (contest-clarifications, contest-announcements, contest-quick-stats, workers-client) properly pause/resume the interval. The leaderboard is the only polling component that uses this "fire but skip" pattern.
**Concrete failure scenario:** A contest with 100 participants. Several users keep the leaderboard open in background tabs. Each tab fires a timer callback every 30 seconds that does nothing but check visibility. No real performance impact, but it is inconsistent with the established pattern.
**Fix:** Refactor to use the visibility-based pause/resume pattern from `contest-clarifications.tsx`.
**Confidence:** LOW

### PERF-2: Practice page Path B progress filter (carried from cycle 18) [MEDIUM/MEDIUM]

**Files:** `src/app/(public)/practice/page.tsx:412-449`
**Description:** This is a carried-forward finding (DEFER-1 in the remediation plan). When a progress filter is active, Path B fetches ALL matching problem IDs and ALL user submissions into memory, then filters in JavaScript and paginates. This is correct but does not scale.
**Exit criterion:** Problem count exceeds 5,000 or a performance benchmark shows >2s page load time.
**Confidence:** MEDIUM

## Verified Safe

- Workers page now properly pauses polling on tab visibility change (cycle 22 fix).
- Contest components (clarifications, announcements, quick-stats) all use visibility-aware polling.
- Public problem detail page parallelizes independent queries with `Promise.all`.
- `SubmissionListAutoRefresh` checks `document.visibilityState` before refreshing.
