# Cycle 23 Test Engineer Review

**Date:** 2026-04-20
**Base commit:** bb6f3fc2

## Findings

### TE-1: No tests for `CountdownTimer` component [LOW/MEDIUM]

**Files:** `src/components/exam/countdown-timer.tsx`
**Description:** The `CountdownTimer` component has complex state logic: time offset calculation via server sync, threshold-based toast warnings, interval-based countdown, and expired state management. There are no unit tests for this component. Given that exam timers are critical for test integrity (incorrect countdown could give students extra or insufficient time), tests would provide confidence.
**Fix:** Add unit tests for `CountdownTimer`: verify countdown display, threshold toast triggers, expired state, and server time offset calculation.
**Confidence:** MEDIUM

### TE-2: No tests for visibility-aware polling pattern in contest components [LOW/LOW]

**Files:** `src/components/contest/contest-clarifications.tsx`, `src/components/contest/contest-announcements.tsx`, `src/components/contest/contest-quick-stats.tsx`
**Description:** The contest components implement visibility-based polling pause/resume. This is a common pattern that could be tested once via a shared hook (see ARCH-1) rather than per-component. No tests exist for any of these components' polling behavior.
**Fix:** If the shared `useVisibilityAwarePolling` hook is extracted (per ARCH-1), add tests for the hook. Otherwise, this is low priority.
**Confidence:** LOW

## Verified Safe

- `apiFetch` unit tests are present and comprehensive (cycle 22 M3).
- Existing test infrastructure uses Vitest with proper mocking setup.
