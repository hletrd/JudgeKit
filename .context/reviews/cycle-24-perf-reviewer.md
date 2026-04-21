# Performance Reviewer — Cycle 24

**Date:** 2026-04-20
**Base commit:** f1b478bc

## Findings

### PERF-1: `ContestsLayout` forces full page reload on every internal navigation [MEDIUM/MEDIUM]

**Files:** `src/app/(dashboard)/dashboard/contests/layout.tsx:27`
**Description:** Every internal link click within contest pages triggers `window.location.href = href`, which forces a full page reload instead of Next.js client-side navigation. This means:
1. No RSC payload streaming — the entire page must be fetched from scratch.
2. All JavaScript bundles are re-parsed and re-executed.
3. All API calls (session, settings, capabilities) are re-made on every navigation.
4. The browser loses React state for all components on the page.
**Concrete failure scenario:** An instructor navigating between contest sub-pages (e.g., from contest list to contest detail) experiences a full page reload each time, taking 2-5 seconds instead of <500ms for client-side navigation.
**Fix:** This is a workaround for a Next.js bug. Monitor Next.js releases for the fix and remove the workaround as soon as possible. Consider adding a performance metric to track navigation time on contest pages.
**Confidence:** MEDIUM

### PERF-2: `submission-overview.tsx` polling interval continues when tab is hidden [LOW/MEDIUM]

**Files:** `src/components/lecture/submission-overview.tsx:108-114`
**Description:** The `SubmissionOverview` component uses `setInterval(fetchStats, 5000)` but does not pause the interval when the tab is hidden. This is the same pattern that was fixed for `leaderboard-table.tsx` in cycle 23 (visibility-aware polling). The component already uses `apiFetch` but lacks the visibility-based pause/resume.
**Concrete failure scenario:** An instructor leaves the lecture stats panel open in a background tab. The interval continues firing every 5 seconds, making unnecessary API calls.
**Fix:** Add visibility-aware pause/resume to the interval, matching the pattern established in `leaderboard-table.tsx` and `contest-clarifications.tsx`.
**Confidence:** MEDIUM

## Verified Performant

- `leaderboard-table.tsx` now properly pauses polling when tab is hidden (cycle 23 fix confirmed).
- `workers-client.tsx` now properly pauses polling when tab is hidden (cycle 22 fix confirmed).
- `authUserCache` in proxy.ts has a 2-second TTL with max 500 entries — reasonable.
- No N+1 query patterns found in server-side page components.
