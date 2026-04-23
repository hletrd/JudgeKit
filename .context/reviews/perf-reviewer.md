# Performance Review — RPF Cycle 30

**Date:** 2026-04-23
**Reviewer:** perf-reviewer
**Base commit:** 31afd19b

## Previously Fixed Items (Verified)

- useVisibilityPolling setInterval -> recursive setTimeout (commit 60f24288): Verified
- Contest replay setInterval -> recursive setTimeout (commit 9cc30d51): Verified

## PERF-1: `countdown-timer.tsx` uses `setInterval` — last remaining client-side timer with old pattern [MEDIUM/MEDIUM]

**File:** `src/components/exam/countdown-timer.tsx:117`

The exam countdown timer uses `setInterval(recalculate, 1000)`. This is the last remaining client-side timer using `setInterval` instead of the established recursive `setTimeout` pattern. The codebase has already migrated:
- `useVisibilityPolling` hook (cycle 29, commit 60f24288)
- Contest replay (cycle 28, commit 9cc30d51)
- Anti-cheat heartbeat (already used recursive setTimeout)

The countdown timer has a `visibilitychange` handler that recalculates on tab switch, which mitigates most drift. However, `setInterval` can still cause catch-up behavior in background tabs because browsers throttle intervals to at most once per second. When the tab becomes visible again, all pending intervals may fire rapidly before the visibility change handler runs.

**Concrete failure scenario:** A student switches tabs for 30 seconds during an exam. When they return, the throttled `setInterval` may fire multiple accumulated ticks, causing the remaining time display to briefly flash through intermediate values before the visibility change handler corrects it.

**Fix:** Migrate to recursive `setTimeout` for consistency with the codebase convention and to eliminate the catch-up edge case entirely.

---

## PERF-2: `active-timed-assignment-sidebar-panel.tsx` uses `setInterval` for countdown [LOW/LOW]

**File:** `src/components/layout/active-timed-assignment-sidebar-panel.tsx:63`

This component uses `window.setInterval` for its 1-second countdown tick. This follows the same pattern as the countdown-timer but is lower severity because:
1. It already has a `visibilitychange` handler that corrects drift on tab switch
2. The sidebar timer is informational, not safety-critical like exam countdown
3. The interval self-terminates when all assignments expire

This was previously noted in cycle 29 (PERF-2) and deferred. Listing again for completeness.

**Fix:** Could be migrated to recursive `setTimeout` for consistency, but low priority.

---

## Performance Findings (carried/deferred)

### PERF-CARRIED-1: sidebar interval re-entry — LOW/LOW, deferred from cycle 26
### PERF-CARRIED-2: Unbounded analytics query — carried from DEFER-31
### PERF-CARRIED-3: Scoring full-table scan — carried from DEFER-31
