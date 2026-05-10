# Test Engineer Review — Cycle 33

**Reviewer:** test-engineer
**Date:** 2026-05-10
**Scope:** Test coverage, flaky test patterns, testing gaps

---

## Findings

### C33-TE-1: [MEDIUM] submission-list-auto-refresh has no unit tests

**File:** `src/components/submission-list-auto-refresh.tsx`
**Confidence:** HIGH

This component handles complex timer logic, backoff, and cleanup but has no dedicated test file. The timer leak finding (C33-CR-1) would have been caught with tests.

**Fix:** Add tests for:
- Timer scheduling with backoff
- Cleanup on unmount
- Visibility state handling
- Error count reset on success

---

### C33-TE-2: [MEDIUM] export-button has no unit tests

**File:** `src/components/contest/export-button.tsx`
**Confidence:** HIGH

Export functionality (CSV/JSON download) is untested. The blob download and filename extraction logic are complex enough to warrant tests.

**Fix:** Test blob creation, filename parsing from Content-Disposition, and error handling.

---

### C33-TE-3: [LOW] apiFetchJson edge cases untested

**File:** `src/lib/api/client.ts`
**Confidence:** MEDIUM

The `apiFetchJson` and `parseApiResponse` helpers don't appear to have dedicated unit tests for:
- Network failures (fetch throwing)
- Non-JSON responses
- JSON parse failures
- Response body already consumed

**Fix:** Add comprehensive unit tests for these utilities.

---

### C33-TE-4: [LOW] contests layout workaround untested

**File:** `src/app/(public)/contests/manage/layout.tsx`
**Confidence:** MEDIUM

The Next.js RSC streaming workaround for contest navigation is not tested. If the upstream bug is fixed and this workaround is removed, regressions could occur.

**Fix:** Add tests for the click interception logic, including:
- data-full-navigate attribute detection
- Relative path validation
- preventDefault behavior

---

## Coverage Summary

- Unit tests: 2382 tests passing (good coverage overall)
- Component tests: 208 tests passing
- Missing: timer/async components, export/download, layout workarounds

## Positive Observations

1. Anti-cheat storage extracted to separate module for testability.
2. apiFetchJson and parseApiResponse are pure functions, easily testable.
3. Component tests exist for newer components.
