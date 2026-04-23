# Performance Reviewer — RPF Cycle 6

## Scope
Performance-focused review with attention to recently changed files and carry-forward items.

## Findings

### PERF-1: `anti-cheat-dashboard.tsx` — `useVisibilityPolling` resets to page 1 on every poll
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **File:** `src/components/contest/anti-cheat-dashboard.tsx:118-136`
- **Problem:** `fetchEvents` always requests `offset=0&limit=${PAGE_SIZE}` and replaces the entire events list via `setEvents(json.data.events)`. If the user has loaded more events (via `loadMore`), polling resets to only the first page, losing the expanded view. Additionally, the `offset` state is reset to `json.data.events.length` on every poll, meaning the `loadMore` offset jumps backward.
- **Failure scenario:** Instructor loads 200 events (2 pages), then polling fires and resets to showing only 100. The `loadMore` button then loads the second page again, duplicating events already loaded.
- **Fix:** On poll, merge new events into the existing list rather than replacing. Or, preserve `offset` when polling and only update if the total changes.

### PERF-2: `score-timeline-chart.tsx` — SVG recalculation on every render for unchanged data
- **Severity:** LOW
- **Confidence:** LOW
- **File:** `src/components/contest/score-timeline-chart.tsx:47-58`
- **Problem:** The `polyline` string and point coordinates are recomputed on every render. While lightweight for small datasets, this could benefit from `useMemo`. However, the component already re-renders only when `selectedUserId` changes, so the practical impact is minimal.
- **Fix:** Wrap polyline computation in `useMemo` keyed on `selected.points` and constants. Low priority.

### PERF-3: `active-timed-assignment-sidebar-panel.tsx` — `setInterval` timer does not stop when component unmounts during active assignment
- **Severity:** LOW
- **Confidence:** HIGH
- **File:** `src/components/layout/active-timed-assignment-sidebar-panel.tsx:62-89`
- **Problem:** The `useEffect` dependency is `[assignments]`, but when the timer's `clearInterval` is called inside the interval callback (when all assignments expire), it does not clear the React-side reference. If `assignments` prop changes after the self-clear, the effect cleanup would try to clear an already-cleared interval. This is harmless (clearing a cleared interval is a no-op), but the pattern is slightly fragile.
- **Fix:** Use a ref for the interval ID to enable the cleanup to check before clearing. Very low priority.

### PERF-4: Carried from cycle 5 AGG-5 — Dual count + data queries in API routes
- **Status:** NOT FIXED
- **Severity:** LOW
