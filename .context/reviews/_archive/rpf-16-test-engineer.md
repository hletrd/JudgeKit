# RPF Cycle 16 — Test Engineer

**Date:** 2026-04-20
**Base commit:** 58da97b7

## Findings

### TE-1: Missing test for past `expiryDate` in bulk recruiting invitations [MEDIUM/HIGH]

- **File:** `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/bulk/route.ts:62-68`
- **Description:** The bulk route does not reject past `expiryDate` values, and there is likely no test covering this case for the bulk endpoint. The single-create and PATCH routes have this validation, so their tests should pass, but the bulk route's missing validation means there is a test gap.
- **Fix:** Add a test case that sends `expiryDate: "2020-01-01"` in a bulk request and expects a 400 response (after fixing the route). Also add a test for a date within the valid range to confirm it works.
- **Confidence:** MEDIUM (test file not examined, but the code gap is clear)

### TE-2: No integration test for clipboard error handling across components [LOW/LOW]

- **Files:** Multiple client components
- **Description:** The clipboard error handling pattern is inconsistent across components, but there are no integration tests for clipboard failures in any component. This is expected for a UI-level concern that is difficult to test in a Node.js test environment (clipboard API is browser-only).
- **Fix:** Consider adding a `useClipboard` hook with unit tests that mock `navigator.clipboard.writeText`.
- **Confidence:** LOW

## Verified Safe

- Existing recruiting invitation route tests cover the `expiryDateTooFar` and `expiryDateInPast` cases for single and PATCH routes.
- No test regressions detected from rpf-15 changes.
