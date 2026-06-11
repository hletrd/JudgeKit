# Test Engineer Review — Cycle 4 (RPF Loop)

**Date:** 2026-05-11
**Reviewer:** test-engineer (orchestrator direct — Agent tool unavailable)
**Scope:** Recently modified components, test coverage gaps

---

## Summary

2 LOW findings. Both are test-coverage gaps for recently-modified behavior.

---

## LOW

### T4-L1: Missing Tests for CreateProblemForm `isDirty` Test Case Tracking
- **File:** `src/app/(public)/problems/create/create-problem-form.tsx:122-141`
- **Confidence:** High
- **Description:** The `isDirty` calculation is complex and was recently modified (cycle 3). There are no unit or component tests verifying that editing test cases, changing float tolerances, or toggling test-case override marks the form as dirty. This is the highest-risk untested user interaction because test-case data is the largest and most expensive to re-enter.
- **Suggested test:**
  ```ts
  // render form with initialProblem containing test cases
  // modify a test case input
  // trigger navigation guard
  // expect guard to block navigation
  ```

### T4-L2: No Component Tests for Auth Form AbortController Behavior
- **Files:**
  - `src/app/(auth)/forgot-password/forgot-password-form.tsx`
  - `src/app/(auth)/reset-password/reset-password-form.tsx`
- **Confidence:** Medium
- **Description:** The AbortController integration added in cycle 3 is not covered by component tests. There should be tests verifying that:
  1. Submitting the form twice aborts the first request.
  2. Unmounting the component aborts the in-flight request.
  3. The aborted request does not update state after unmount.
- **Suggested test:** Mock `fetch` with a delayed Promise, assert `AbortController.abort()` is called on re-submit and on unmount.

---

## Coverage Notes

- `verify-email/page.tsx` has component tests (`tests/component/verify-email-page.test.tsx`) added in cycle 3.
- Group dialogs lack dedicated component tests; they are tested indirectly via Playwright e2e tests.
- The `isDirty` bug (code-reviewer C4-M1) would have been caught by a component test for `useUnsavedChangesGuard`.
