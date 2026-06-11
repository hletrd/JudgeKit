# RPF Cycle 15 — Test Engineer

**Date:** 2026-04-20
**Base commit:** f0bef9cb

## Findings

### TE-1: No test coverage for `expiryDate` far-future validation [MEDIUM/MEDIUM]

**Files:** `tests/unit/api/api-keys.route.test.ts`, no equivalent test for recruiting invitations

The API keys route has tests that verify `expiryDays` validation (min/max). However, there are no tests verifying that `expiryDate` with an unreasonably far-future date is rejected. This is directly related to SEC-1/CR-6 — the validation gap exists partly because there's no test enforcing the constraint.

**Fix:** Add a test case that sends `expiryDate: "2099-12-31"` and expects a 400 error, and another that sends a date just within the 10-year limit and expects success.

**Confidence:** MEDIUM

### TE-2: No test for duplicate `getDbNowUncached()` consolidation in recruiting invitations [LOW/LOW]

**File:** `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/route.ts`

After the fix for CR-1 (fetching `dbNow` once), there should be a test that verifies the route only makes one `SELECT NOW()` call. This is a low-priority test that would catch regressions.

**Fix:** Mock `getDbNowUncached` and verify it's called exactly once per request.

**Confidence:** LOW

## Verified Safe

- Existing tests for `withUpdatedAt()` helper updated to pass required `now` parameter — verified in `tests/unit/db/helpers.test.ts`.
- API key route tests updated for `expiryDays` schema — verified in `tests/unit/api/api-keys.route.test.ts`.
