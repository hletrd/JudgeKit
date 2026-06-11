# Test Engineer Review — Cycle 39

**Date:** 2026-04-23
**Reviewer:** test-engineer
**Base commit:** c176d8f5

## TE-1: No test for bulk invitation `MAX_EXPIRY_MS` guard on `expiryDays` path [MEDIUM/MEDIUM]

**File:** Tests for `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/bulk/route.ts`

**Description:** The bulk invitation route's `expiryDays` code path has no test verifying that the `MAX_EXPIRY_MS` guard is enforced. While the guard is currently missing (CR-1/SEC-1), adding a test would ensure it is implemented and stays in place.

**Concrete failure scenario:** The `MAX_EXPIRY_MS` guard is added in a future cycle but then accidentally removed. Without a test, the regression would go unnoticed.

**Fix:** Add a test that creates a bulk invitation with `expiryDays` close to the Zod max (3650) and verifies the invitation is created, then tests with a value that would exceed `MAX_EXPIRY_MS` (if the Zod max were relaxed).

**Confidence:** Medium

---

## TE-2: No test for invitation "un-revoke" behavior [MEDIUM/MEDIUM]

**File:** Tests for `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/[invitationId]/route.ts`

**Description:** There is no test verifying what happens when a PATCH request attempts to transition an invitation from "revoked" back to "pending". The route's state machine allows it, but the library function rejects it. A test would document the expected behavior.

**Fix:** Add a test that: (1) creates an invitation, (2) revokes it, (3) attempts to un-revoke it via PATCH, and (4) verifies the response (currently 500 due to unhandled error).

**Confidence:** Medium

---

## TE-3: No test for exam session start on non-exam assignment [LOW/MEDIUM]

**File:** Tests for `src/app/api/v1/groups/[id]/assignments/[assignmentId]/exam-session/route.ts`

**Description:** No test verifies that starting an exam session on a non-exam assignment (examMode="none") returns an appropriate error.

**Fix:** Add a test that creates a non-exam assignment and attempts to start an exam session, verifying the error response.

**Confidence:** Low

---

## Existing Test Coverage Assessment

The test suite has 2116+ unit tests and comprehensive coverage of the recruiting invitation flows. The recent cycle 38 fixes have adequate coverage. The gaps identified above are edge cases in error-handling paths.
