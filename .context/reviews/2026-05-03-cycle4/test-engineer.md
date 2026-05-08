# Test Engineer Review — Cycle 4

**Date:** 2026-05-03
**HEAD reviewed:** `11d9b33a`
**Focus:** Test coverage gaps, flaky tests, TDD opportunities

---

## C4-TE-1 (MEDIUM, HIGH confidence) — No test for `_sys.` namespace validation in `updateRecruitingInvitation`

**File:** `src/lib/assignments/recruiting-invitations.ts:258-289`

`createRecruitingInvitation` and `bulkCreateRecruitingInvitations` have the `findInternalKeyViolation` guard but `updateRecruitingInvitation` does not. Since there is no test for this boundary, the gap went undetected. A test should verify that the update path rejects `_sys.` keys (after the fix is applied).

**Fix:** Add integration/unit test verifying `updateRecruitingInvitation(id, { metadata: { "_sys.test": "x" } })` throws or rejects the update.

---

## C4-TE-2 (LOW, MEDIUM confidence) — `incrementFailedRedeemAttempt` not covered by integration tests

**File:** `src/lib/assignments/recruiting-invitations.ts:64-77`

The atomic `incrementFailedRedeemAttempt` (fixed in cycle 3) has no integration test verifying that concurrent calls correctly serialize and increment the counter. The cycle 3 finding (F4) noted this gap but the tests were deferred. Without a concurrent test, a regression in the `sql.raw` construction could silently break the atomic increment.

**Fix:** Add a test that runs `incrementFailedRedeemAttempt` concurrently (e.g., 10 parallel calls) and verifies the counter reaches 10, not a lower value.
