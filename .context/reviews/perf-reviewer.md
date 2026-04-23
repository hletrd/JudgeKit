# Performance Review — RPF Cycle 18

**Date:** 2026-04-22
**Reviewer:** perf-reviewer
**Base commit:** d32f2517

## PERF-1: `recruiter-candidates-panel.tsx` loads full export dataset into memory — no pagination [MEDIUM/HIGH]

**File:** `src/components/contest/recruiter-candidates-panel.tsx:50-53`
**Confidence:** HIGH

This component fetches the entire candidate export dataset (potentially thousands of records) into the browser, then does client-side search and sort. No server-side pagination, filtering, or sorting is used. This is the same issue as CR-1 from the code reviewer and DEFER-29, but flagged here for performance impact.

**Concrete failure:** A contest with 5000+ candidates causes a large JSON payload download and full in-memory sort/filter. Client-side sorting of 5000 objects on every keystroke in the search box causes noticeable jank.

**Fix:** Create a dedicated server-side paginated endpoint with search and sort parameters.

---

## PERF-2: Practice page Path B progress filter still fetches all matching IDs + submissions into memory [MEDIUM/MEDIUM]

**File:** `src/app/(public)/practice/page.tsx:410-519`
**Confidence:** HIGH

This was identified in cycle 18 (AGG-5) and cycle 19 (AGG-5) and remains unfixed. When a progress filter is active, Path B fetches ALL matching problem IDs and ALL user submissions into memory, filters in JavaScript, and paginates. The code has a comment acknowledging this should be moved to SQL.

**Fix:** Move the progress filter logic into a SQL CTE or subquery.

---

## PERF-3: `active-timed-assignment-sidebar-panel.tsx` uses `setInterval` without visibility awareness [LOW/MEDIUM]

**File:** `src/components/layout/active-timed-assignment-sidebar-panel.tsx:72-84`
**Confidence:** MEDIUM

The sidebar timer uses `window.setInterval` with 1-second ticks. Unlike the `countdown-timer.tsx` and `submission-list-auto-refresh.tsx`, this component does not pause its timer when the page is hidden. The timer continues ticking in the background, wasting CPU cycles when the tab is not visible.

**Concrete failure:** The timer continues firing every second even when the browser tab is hidden, preventing the browser from fully throttling background tabs.

**Fix:** Add a `visibilitychange` listener to pause/resume the interval, similar to `countdown-timer.tsx`.

---

## PERF-4: `code-timeline-panel.tsx` fetches all snapshots without pagination [LOW/MEDIUM]

**File:** `src/components/contest/code-timeline-panel.tsx:50-72`
**Confidence:** MEDIUM

The code timeline fetches all code snapshots for a user in a contest in a single request. For a student who submits frequently over a multi-hour exam, this could be hundreds of snapshots loaded at once.

**Fix:** Add pagination or limit the number of snapshots returned. Low priority because the data per snapshot is small (metadata only, source code loaded on demand via selectedIdx).

---

## Verified Safe

- All polling components use `useVisibilityPolling` with AbortController
- `contest-quick-stats` properly validates response data with `Number.isFinite`
- `submission-list-auto-refresh` uses recursive `setTimeout` with backoff
- Anti-cheat heartbeat uses recursive `setTimeout` (not `setInterval`)
- `countdown-timer` has visibility-aware recalculation on tab switch
- `apiFetchJson` helper avoids double `.json()` parsing
