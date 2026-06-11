# Test Engineer Review — Cycle 2 (Fresh)

**Base commit:** 31049465
**Reviewer:** test-engineer
**Focus:** Test coverage gaps, flaky tests, TDD opportunities, regression risks

---

## C2-TEST-1 — No unit tests for `getParticipantTimeline`
**Severity:** HIGH | **Confidence:** High
**File:** `src/lib/assignments/participant-timeline.ts`

The core timeline data transformation logic (sorting, first-AC detection, late penalty application, anti-cheat aggregation) has no dedicated unit tests. This is complex business logic with edge cases (no submissions, all wrong answers, ICPC vs IOI, late penalties).

**Failure scenario:** A future refactor changes the `isFirstAc` logic and breaks ICPC/IOI differentiation. No test catches it.

**Fix:** Add unit tests in `tests/unit/assignments/participant-timeline.test.ts` covering:
- Empty participant (returns null)
- Participant with no submissions
- ICPC scoring: first AC detection via status
- IOI scoring: first AC detection via score >= points
- Late penalty application
- Anti-cheat aggregation
- Snapshot inclusion in timeline

---

## C2-TEST-2 — No component tests for `ParticipantTimelineBar`
**Severity:** MEDIUM | **Confidence:** High
**File:** `src/components/contest/participant-timeline-bar.tsx`

The timeline bar component has complex rendering logic (event markers, tooltips, mini timelines, color coding) with no component tests.

**Fix:** Add tests in `tests/component/participant-timeline-bar.test.tsx` covering:
- Empty state (no events)
- Event marker rendering
- Color assignment cycling
- Tooltip content
- Mini timeline bar rendering

---

## C2-TEST-3 — No regression test for orphaned submission reset
**Severity:** MEDIUM | **Confidence:** High
**File:** `src/app/api/v1/judge/claim/route.ts:328-341`

The recent fix (commit `fe5885c9`) adds reset-to-pending when a problem is missing after claim. No test verifies this behavior.

**Fix:** Add an API test that:
1. Creates a submission for a problem
2. Deletes the problem (or mocks the query to return null)
3. Calls the claim endpoint
4. Asserts 422 response and submission status reset to "pending"

---

## C2-TEST-4 — No test for `z.coerce.number()` NaN handling
**Severity:** LOW | **Confidence:** Medium
**File:** `src/app/api/v1/judge/claim/route.ts`

The `claimedSubmissionRowSchema` accepts `NaN` via coercion. No test verifies that malformed DB responses are rejected.

**Fix:** Add a unit test that passes `{ executionTimeMs: "abc" }` to the schema and asserts validation failure (currently it passes).

---

## C2-TEST-5 — Instructor view of student submission not tested
**Severity:** MEDIUM | **Confidence:** High
**File:** `src/app/(public)/submissions/[id]/page.tsx`

The `canViewAsInstructor` path has no test coverage. The E2E tests should verify that instructors can view student submissions with appropriate data visibility.

**Fix:** Add E2E test: log in as instructor, navigate to a student's submission, verify source code and results are visible.

---

## Commonly Missed Sweep

- Existing component tests in `tests/component/` are comprehensive for other features.
- The judge claim endpoint has API tests (confirmed by prior cycle work).
- The submissions API route has tests for rate limiting and validation.
