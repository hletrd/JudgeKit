# Test Engineer Review — Cycle 2

**Reviewer:** test-engineer
**Date:** 2026-04-28
**Scope:** Test coverage gaps, regression risk from cycle 1 fixes

---

## Findings

### TE-C2-1: [MEDIUM] No regression tests for the two confirmed bugs fixed in cycle 1

**Confidence:** HIGH

The cycle 1 review identified and fixed two confirmed bugs:
1. `totalPoints` reduce initial value was 100 instead of 0 (AGG-1)
2. `StartExamButton` received `durationMinutes={0}` instead of actual exam duration (AGG-2)

Neither fix has a corresponding test. Without tests, a future refactor could reintroduce these bugs.

**Fix:** Add tests:
1. Unit test: given a set of problems with known points, `totalPoints` should equal the sum of points (not sum + 100).
2. Integration test: when rendering the problem detail page with an `assignmentId` that has `examDurationMinutes: 120`, the `StartExamButton` component should receive `durationMinutes=120`.

---

### TE-C2-2: [LOW] `formatScore` called without locale in enrolled contest detail

**File:** `src/app/(public)/contests/[id]/page.tsx:396`
**Confidence:** LOW

Also flagged by DBG-C2-2. The `formatScore(sub.score)` call omits the `locale` parameter, which means scores in the enrolled view always use the default locale (`en-US`) for digit grouping. This is a minor localization gap that tests would catch if they assert on rendered score format.

**Fix:** Pass `locale` to `formatScore`: `formatScore(sub.score, locale)`.

---

## Test Coverage Assessment

The public contest and practice pages have zero test coverage. The cycle 1 bugs (totalPoints, examDurationMinutes) would not be caught by any existing test. This is a significant gap for student-facing pages where correctness matters.

---

## Summary

| ID | Finding | Priority |
|----|---------|----------|
| TE-C2-1 | No regression tests for cycle 1 bug fixes | MEDIUM |
| TE-C2-2 | formatScore missing locale parameter | LOW |
