# Critic Review — Cycle 2

**Reviewer:** critic
**Date:** 2026-04-28
**Scope:** Multi-perspective critique of the full change surface

---

## Cycle 1 Fix Assessment

The cycle 1 fixes are correct and minimal. No overengineering or under-fixing. However, the fixes were not consistently applied to all pages sharing the same patterns — the contests listing page still has the same badge styling issues that were fixed in the detail page.

---

## Findings

### CRIT-C2-1: [MEDIUM] Cycle 1 dark mode fix applied to detail page but not listing page — incomplete fix

**File:** `src/app/(public)/contests/page.tsx:188`
**Confidence:** HIGH

The AGG-13 fix (dark mode badge colors) was applied only to `contests/[id]/page.tsx` but not to `contests/page.tsx`. This is a common pattern in code review remediation: fixing the specific file cited in the finding without checking for the same pattern in other files.

**Fix:** Apply the same dark mode treatment to all badge instances in the My Contests section of the listing page.

---

### CRIT-C2-2: [LOW] No tests were added for the two HIGH/MEDIUM bugs fixed in cycle 1

**Files:** None — test files missing
**Confidence:** HIGH

AGG-7 (no tests for new public pages) was deferred, but the two bugs fixed in cycle 1 (totalPoints off-by-100, examDurationMinutes=0) are exactly the kind of bugs that tests would prevent from recurring. Without tests, these bugs could regress in a future refactor.

**Fix:** Add at minimum: (1) a test that `totalPoints` equals the sum of problem points, (2) a test that `StartExamButton` receives the correct `durationMinutes` prop from the assignment context.

---

### CRIT-C2-3: [LOW] `points ?? 100` default is a latent source of confusion

**File:** Multiple (see ARCH-C2-2)
**Confidence:** MEDIUM

The `100` default for `points` is not documented or centralized. It appears in 6+ locations and could be misinterpreted as "100 points is the standard problem weight" rather than "100 is a fallback when the field is null".

**Fix:** Extract a shared constant `DEFAULT_PROBLEM_POINTS = 100` with a comment explaining the semantic.

---

## Summary

The cycle 1 fixes are sound but incomplete in scope — the same styling patterns exist on other pages. The most critical gap is the lack of regression tests for the bugs that were fixed.
