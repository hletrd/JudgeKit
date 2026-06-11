# Cycle 27 Performance Reviewer

**Date:** 2026-04-22
**Base commit:** 14025d58

## Findings

### PERF-1: `contest-replay.tsx` still uses `setInterval` instead of recursive `setTimeout` [LOW/LOW]

**File:** `src/components/contest/contest-replay.tsx:77-87`

**Description:** The auto-play feature uses `window.setInterval` for advancing the replay index. This was identified in the cycle-26 aggregate (AGG-5) and deferred. The codebase convention in `countdown-timer.tsx` and `anti-cheat-monitor.tsx` uses recursive `setTimeout` for timer drift prevention. The `setInterval` pattern can accumulate drift under browser throttling.

**Failure scenario:** When the browser tab is backgrounded and then foregrounded, the `setInterval` callback may fire multiple times in rapid succession, causing the replay to skip frames.

**Fix:** Replace with recursive `setTimeout`.

**Confidence:** LOW (this was previously deferred as LOW/LOW)

### PERF-2: `active-timed-assignment-sidebar-panel.tsx` interval re-entry edge case [LOW/LOW]

**File:** `src/components/layout/active-timed-assignment-sidebar-panel.tsx:53-89`

**Description:** This was identified in the cycle-26 aggregate (AGG-6) and deferred. The `setInterval` callback clears itself when all assignments expire, but the effect depends on `[assignments]` reference equality. If a new assignment is added while the interval is stopped (component still mounted), the effect won't re-run because the `assignments` reference hasn't changed.

**Fix:** Add a derived `hasActiveAssignment` boolean to the effect dependencies.

**Confidence:** LOW (previously deferred)

## Verified Safe

- SSE events route uses shared polling manager (single `setInterval` for all active submissions).
- Audit event buffer uses `setInterval` with `unref()` for non-blocking flush.
- Data retention maintenance uses `setInterval` with `unref()`.
- Rate limiter eviction uses `setInterval` with `unref()`.
- No N+1 query patterns observed in API routes.
- `React.cache()` deduplication properly implemented for recruit page.
