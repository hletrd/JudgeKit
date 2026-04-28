# Test Engineering Review — Cycle 1 (New Session)

**Reviewer:** test-engineer
**Date:** 2026-04-28
**Scope:** Test coverage analysis for recent changes and overall test health

---

## Findings

### TE-1: [MEDIUM] No tests for the new public contest detail enrolled view

**File:** `src/app/(public)/contests/[id]/page.tsx`
**Confidence:** HIGH

The enrolled contest detail view (lines 131-421) is a significant new feature with complex conditional rendering (upcoming, past, exam modes, anti-cheat, countdown timer, leaderboard, submissions table). There are no component or integration tests for this view.

**Failure scenario:** The `totalPoints` bug (CR-1) would not be caught by any existing test. Similarly, the `StartExamButton` receiving 0 duration (CR-2) would not be caught.

**Fix:** Add component tests covering:
1. Enrolled student with upcoming contest (shows countdown)
2. Enrolled student with active contest (shows problems, submit button)
3. Enrolled student with past contest (shows closed message)
4. Total points calculation with multiple problems
5. Windowed exam flow (start button, countdown)

---

### TE-2: [MEDIUM] No tests for the assignment context on problem detail page

**File:** `src/app/(public)/practice/problems/[id]/page.tsx`
**Confidence:** HIGH

The `assignmentId` search parameter handling (lines 150-211) introduces new branching logic: validation redirect, exam session lookup, deadline checking, submission blocking, and anti-cheat activation. None of these paths have tests.

**Failure scenario:** Changes to `validateAssignmentSubmission` could break the redirect behavior without any test catching it.

**Fix:** Add integration tests for the assignment context flow:
1. Problem with valid assignmentId (shows exam UI)
2. Problem with invalid assignmentId (redirects)
3. Problem with expired deadline (shows blocked state)
4. Problem with windowed exam and no session (shows start button)

---

### TE-3: [LOW] Existing test suite is comprehensive for other areas

The component test suite covers 50+ components. Unit tests cover 304 files with 2234 tests passing. The gap is specifically in the newly added public contest/problem detail pages, which makes sense given their recent addition.

---

## Test Infrastructure Notes

- `vitest.config.ts` — unit tests
- `vitest.config.component.ts` — component tests
- `vitest.config.integration.ts` — integration tests
- `playwright.config.ts` — e2e tests
- All configs appear well-structured.
