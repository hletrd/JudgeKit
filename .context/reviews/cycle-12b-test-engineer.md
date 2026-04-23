# Cycle 12b Test Engineer Report

**Date:** 2026-04-20
**Base commit:** feeb4a30

## Inventory of Reviewed Test Files

- `tests/unit/auth/recruiting-token-db-time.test.ts` — DB-time tests for recruiting token
- `tests/unit/recruit-page-metadata.test.ts` — recruit page metadata tests
- `tests/unit/db/export-with-files.test.ts` — export with files tests

## Findings

### TE-1: [LOW] No test verifying that server components use DB time for deadline comparisons

- **Confidence:** HIGH
- **Files:** Missing test coverage for `contests/page.tsx`, `groups/[id]/page.tsx`, `assignments/[assignmentId]/page.tsx`, `student-dashboard.tsx`
- **Description:** The recruit page has test coverage verifying `getDbNow()` usage (added in cycle 27 L1), but the other 4 server components that compare against DB-stored deadlines have no equivalent tests. If someone refactors these components to use `new Date()` instead of `getDbNow()`, there would be no test to catch the regression.
- **Fix:** Add targeted tests verifying that each server component imports and uses `getDbNow()` for temporal comparisons. These can follow the same pattern as the existing `recruit-page-metadata.test.ts`.

### TE-2: [LOW] No test for `getContestStatus` with DB time vs app-server time

- **Confidence:** MEDIUM
- **Files:** No test file for `src/lib/assignments/contests.ts`
- **Description:** The `getContestStatus` function has no unit test. This is a pure function that determines contest status from a contest entry and a `now` timestamp. It would be straightforward to test with various boundary conditions around deadlines and startsAt values.
- **Fix:** Add unit tests for `getContestStatus` covering: upcoming, open, in_progress, expired, closed states; boundary conditions (deadline exactly equal to `now`); scheduled vs windowed exam modes.

### TE-3: [LOW] No test for `selectActiveTimedAssignments` filtering logic

- **Confidence:** MEDIUM
- **Files:** No test file for `src/lib/assignments/active-timed-assignments.ts`
- **Description:** The `selectActiveTimedAssignments` function filters and sorts contest entries but has no unit test. The sorting logic (by deadline then startedAt) and filtering logic (in_progress or open+scheduled) could benefit from test coverage.
- **Fix:** Add unit tests for `selectActiveTimedAssignments` covering various contest states and sorting behavior.

## Test Gaps (Priority Order)

1. Server component DB-time usage for deadline comparisons (TE-1)
2. `getContestStatus` boundary conditions (TE-2)
3. `selectActiveTimedAssignments` filtering/sorting (TE-3)
