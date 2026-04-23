# RPF Cycle 4 — Performance Reviewer

**Date:** 2026-04-22
**Base commit:** 5d89806d

## Findings

### PERF-1: `countdown-timer.tsx` `setInterval` ticks every second even when tab is hidden [MEDIUM/MEDIUM]

**File:** `src/components/exam/countdown-timer.tsx:100`
**Confidence:** HIGH

The `setInterval` on line 100 ticks every second regardless of document visibility. When the page is hidden, the interval continues to fire and update state, causing unnecessary re-renders. Browsers may also throttle `setInterval` in background tabs, causing the displayed remaining time to drift from the actual deadline.

**Concrete impact:** During an exam, students frequently switch tabs (especially with the anti-cheat monitor). The timer continues ticking in the background but may be throttled, showing an incorrect remaining time when they switch back.

**Fix:** Add a `visibilitychange` listener that recalculates `remaining` when the tab becomes visible again, since the actual remaining time can be computed from `deadline - Date.now() + offsetRef.current` at any point.

---

### PERF-2: `compiler-client.tsx` `handleLanguageChange` recreated on every keystroke due to `sourceCode` dependency [LOW/MEDIUM]

**File:** `src/components/code/compiler-client.tsx:205`
**Confidence:** MEDIUM (same as CR-5, carried from cycle 3)

The `handleLanguageChange` callback depends on `sourceCode` in its dependency array, creating a new function reference on every keystroke. This is a minor performance issue since the function is only passed to `LanguageSelector` which likely doesn't re-render on every reference change, but it's wasteful.

**Fix:** Use a ref for `sourceCode` in the comparison.

---

### PERF-3: `active-timed-assignment-sidebar-panel.tsx` timer runs even when all assignments are expired [LOW/LOW]

**File:** `src/components/layout/active-timed-assignment-sidebar-panel.tsx:62-79`
**Confidence:** MEDIUM

The component correctly checks `hasActiveAssignment` before starting the timer (line 65). However, once the timer is running, it doesn't stop when the last assignment expires. The `assignments` dependency in the `useEffect` only triggers re-evaluation when the `assignments` prop changes (e.g., on revalidation), not when an assignment naturally expires. This means the timer keeps ticking at 1-second intervals even after all assignments have passed their deadlines, until the next page revalidation.

**Fix:** Inside the `setInterval` callback, check if all assignments are expired and if so, clear the interval and update state accordingly.

---

### PERF-4: SSE shared poll timer interval is not configurable at runtime [LOW/LOW]

**File:** `src/app/api/v1/submissions/[id]/events/route.ts:140-150`
**Confidence:** LOW

The shared poll timer interval is read from `getConfiguredSettings().ssePollIntervalMs` when the timer starts, but if the setting changes, the interval is not updated until the timer is restarted (all subscribers disconnect and a new one connects). This is a minor issue since the setting is unlikely to change frequently.

---

## Verified Safe / No Performance Issue

- `useVisibilityPolling` correctly pauses when page is hidden (prevents unnecessary network requests)
- `SubmissionListAutoRefresh` properly implements exponential backoff with `apiFetch("/api/v1/time")`
- SSE `queryFullSubmission` correctly excludes `sourceCode` from column selection (cycle 3 fix confirmed)
- Recruiting invitations panel properly uses separate `fetchInvitations` and `fetchStats` functions (cycle 3 fix confirmed)
- `contest-quick-stats.tsx` properly validates response shape with `Number.isFinite`
