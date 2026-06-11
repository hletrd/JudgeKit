# Cycle 12 — Test Engineer

**Date:** 2026-04-19
**Base commit:** 2339c7ea

## Findings

### CR12-TE1 — [MEDIUM] No test for `authorizeRecruitingToken` field completeness vs `mapUserToAuthFields`

- **File:** `tests/unit/auth/recruiting-token.test.ts` (does not exist)
- **Confidence:** HIGH
- **Evidence:** The recruiting token auth path has no unit test verifying that the returned user object includes all fields that `mapUserToAuthFields` produces. After the cycle 11 refactoring of `config.ts`, there's a test gap where the recruiting token path could silently miss new fields. This is the same class of bug that was fixed in cycle 10 (missing `shareAcceptedSolutions` in `authorize()`).
- **Suggested fix:** Add a unit test that verifies `authorizeRecruitingToken` output keys match `mapUserToAuthFields` output keys.

### CR12-TE2 — [LOW] No test for `mustChangePassword` bypass via recruiting token path

- **File:** `tests/unit/auth/recruiting-token.test.ts` (does not exist)
- **Confidence:** MEDIUM
- **Evidence:** There's no test verifying what happens when a user with `mustChangePassword = true` authenticates via a recruiting token. The current code hardcodes `mustChangePassword: false`, which would bypass the forced password change — but there's no test to catch this regression.
- **Suggested fix:** Add a test case where `mustChangePassword` is true and verify the returned value reflects it.

### CR12-TE3 — [LOW] `recordRateLimitFailure` vs `consumeRateLimitAttemptMulti` behavior parity not tested

- **File:** `tests/unit/security/rate-limit.test.ts`
- **Confidence:** MEDIUM
- **Evidence:** The two functions implement the same block-duration calculation but with subtle differences (`blockedUntil || null` vs `blockedUntil > 0 ? blockedUntil : null`). There's no test verifying they produce identical block durations for the same input.
- **Suggested fix:** Add a property-based test or shared test case verifying both functions compute the same block duration.

### CR12-TE4 — [LOW] PublicHeader capability-based dropdown filtering not tested

- **File:** No test file found for `getDropdownItems`
- **Confidence:** MEDIUM
- **Evidence:** The `getDropdownItems` function in `public-header.tsx` was refactored in cycle 10 to use capability-based filtering instead of role-based checks. There's no unit test verifying that the capability checks produce the correct dropdown items for different capability sets.
- **Suggested fix:** Add a unit test for `getDropdownItems` covering: (1) no capabilities (2) problems.create only (3) groups.view_all (4) system.settings (5) full admin capabilities.

## Test Coverage Gaps (Priority Order)

1. `authorizeRecruitingToken` field completeness (CR12-TE1) — MEDIUM
2. `mustChangePassword` bypass via recruiting token (CR12-TE2) — LOW
3. `getDropdownItems` capability-based filtering (CR12-TE4) — LOW
4. Rate limit function parity (CR12-TE3) — LOW
5. JWT callback DB query TTL cache (deferred from cycle 9)
6. SSE re-auth integration test (deferred from cycle 9)
