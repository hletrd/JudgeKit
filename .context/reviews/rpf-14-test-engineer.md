# RPF Cycle 14 - Test Engineer

**Date:** 2026-04-20
**Base commit:** c39ded3b

## Findings

### TE-1: No test for API key creation with client-provided expiresAt [MEDIUM/HIGH]

**File:** `src/app/api/v1/admin/api-keys/route.ts`

**Description:** There is no test that verifies the `expiresAt` value stored for an API key is computed relative to DB server time rather than the client-provided timestamp. This means the clock-skew bug (SEC-1, CR-1) has no test coverage.

**Fix:** Add a test that:
1. Creates an API key with `expiresAt` set to a specific timestamp.
2. Verifies the stored `expiresAt` matches the provided value (current behavior).
3. After fixing, change the test to verify that the server computes `expiresAt` from `expiryDays` + DB time.

**Confidence:** High

### TE-2: No test for recruiting invitation creation with client-provided expiresAt [MEDIUM/HIGH]

**File:** `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/route.ts`

**Description:** Same as TE-1 but for recruiting invitations. No test validates the `expiresAt` storage behavior.

**Fix:** Add similar test coverage.

**Confidence:** High

### TE-3: No test for `withUpdatedAt()` time-source behavior [LOW/MEDIUM]

**File:** `src/lib/db/helpers.ts`

**Description:** `withUpdatedAt()` has no unit test verifying that the `now` parameter overrides the default `new Date()`. After the fix (making `now` required), tests should verify that callers provide it.

**Fix:** Add a unit test for `withUpdatedAt()` with and without the `now` parameter.

**Confidence:** Medium

### TE-4: No test for timer cleanup behavior on locale change [LOW/LOW]

**File:** `src/app/(dashboard)/dashboard/admin/api-keys/api-keys-client.tsx:98-105`

**Description:** The `useEffect` cleanup with `[t]` dependency has a state leak bug (DBG-2) but no test would catch it in a component test since locale changes during active copy feedback are an edge case.

**Fix:** Add a component test that verifies copy feedback timer state resets correctly after locale change.

**Confidence:** Low
