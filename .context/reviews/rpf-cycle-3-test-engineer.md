# RPF Cycle 3 — Test Engineer

**Date:** 2026-04-22
**Base commit:** 678f7d7d

## Findings

### TE-1: No tests for `SubmissionListAutoRefresh` backoff behavior — and the behavior is non-functional [MEDIUM/HIGH]

**File:** `src/components/submission-list-auto-refresh.tsx`
**Confidence:** HIGH

There are no tests for the `SubmissionListAutoRefresh` component. More critically, the backoff behavior it was designed to have is non-functional (see CR-1, V-1). If there were tests, this bug would have been caught.

**Fix:** Add unit tests that mock `router.refresh()` to verify:
1. Base interval is used when no errors occur
2. Error count increments when refresh fails (currently broken)
3. Backoff interval increases with consecutive errors (currently broken)
4. Max backoff is capped at `MAX_BACKOFF_MS` (currently unreachable code)
5. Error count resets on success

---

### TE-2: No tests for `contest-clarifications.tsx` polling and visibility logic [MEDIUM/MEDIUM]

**File:** `src/components/contest/contest-clarifications.tsx`
**Confidence:** MEDIUM

The clarifications component has complex polling logic with visibility-based start/stop. There are no tests for:
1. Interval is created on mount and cleaned up on unmount
2. Interval is paused when page becomes hidden
3. Interval is resumed when page becomes visible
4. No duplicate intervals are created on rapid visibility toggles (currently a bug — DBG-2)

**Fix:** Add component tests with `jest.useFakeTimers()` and mocked `document.visibilityState`.

---

### TE-3: `recruiting-invitations-panel.tsx` — no test for `fetchData` dependency array issue [LOW/LOW]

**File:** `src/components/contest/recruiting-invitations-panel.tsx:110-134`
**Confidence:** LOW

No existing test would catch the `stats` dependency array issue (CR-4/DBG-3). A test that mocks the API to return the same data twice would verify no infinite loop occurs.

---

### TE-4: `compiler-client.tsx` stdin `<textarea>` not tested for keyboard shortcut exclusion [LOW/MEDIUM]

**File:** `src/components/code/compiler-client.tsx:303-314`
**Confidence:** MEDIUM

The keyboard shortcut now correctly excludes textarea/input (fixed in cycle 2), but there's no test verifying this. A regression could re-introduce the bug.

**Fix:** Add an integration test that simulates `Ctrl+Enter` while focus is in the stdin textarea and verifies `handleRun` is NOT called.

---

## Test Coverage Summary

- `clipboard.ts`: No dedicated unit tests (utility was created in cycle 2)
- `submission-list-auto-refresh.tsx`: No tests
- `contest-clarifications.tsx`: No tests
- `compiler-client.tsx`: No component tests for keyboard shortcut behavior
- `anti-cheat-monitor.tsx`: No tests

The highest-priority test gap is `SubmissionListAutoRefresh` — the dead backoff code would have been caught by any basic test.
