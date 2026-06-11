# Test Engineer — Cycle 14

**Date:** 2026-04-24
**Base commit:** ca6b7d84

## CR14-TE1: No test for `mapTokenToSession` field completeness

- **Severity:** MEDIUM
- **Confidence:** HIGH
- **File:** `src/lib/auth/config.ts:142-168`
- **Evidence:** There is no test that verifies `mapTokenToSession` covers all fields in `AUTH_PREFERENCE_FIELDS`. If a field is added to `AUTH_PREFERENCE_FIELDS` and `mapUserToAuthFields` but forgotten in `mapTokenToSession`, there is no automated test to catch the omission. The `shareAcceptedSolutions` bug from cycle 10 was exactly this class of failure.
- **Suggested fix:** Add a unit test that:
  1. Creates a mock JWT token with all fields from `AUTH_PREFERENCE_FIELDS`
  2. Calls `mapTokenToSession`
  3. Asserts that every field in `AUTH_PREFERENCE_FIELDS` is present and correctly set on the session object

  This test should fail if a new field is added to `AUTH_PREFERENCE_FIELDS` but not to `mapTokenToSession`.

## CR14-TE2: No test for rate-limit clock source consistency

- **Severity:** LOW
- **Confidence:** MEDIUM
- **File:** `src/lib/security/rate-limit.ts`, `src/lib/security/api-rate-limit.ts`
- **Evidence:** There is no test that verifies rate-limit functions use a consistent clock source. The existing `api-rate-limit.test.ts` tests the API rate limit path but doesn't verify that the clock source matches across different rate-limit functions that share the same `rateLimits` table.
- **Suggested fix:** Add a test that verifies both `atomicConsumeRateLimit` and `recordRateLimitFailure` write timestamps using the same clock source (either both DB time or both `Date.now()`).

## CR14-TE3: Vitest flake (carried from DEFER-21) — 5-6 tests still fail under `vitest run` but pass in isolation

- **Severity:** LOW
- **Confidence:** HIGH
- **Files:** `tests/unit/public-seo-metadata.test.ts` and 4 others
- **Evidence:** This is a carried-forward deferred item (#21 from cycle 2). All tests pass in isolation. Root cause is vitest worker resource contention.
- **Suggested fix:** No change — this is a known deferred item.

## Verified Prior Fixes

- Cycle 13 test additions for API rate limit (DB time) confirmed present
