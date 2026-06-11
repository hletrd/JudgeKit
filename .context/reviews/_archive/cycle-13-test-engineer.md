# Cycle 13 Test Engineer Report

**Date:** 2026-04-19
**Base commit:** e8340da5
**Reviewer angle:** Test coverage gaps, flaky tests, TDD opportunities

---

## CR13-TE1 — [MEDIUM] No test verifying PublicHeader navigation item consistency across layouts

- **File:** No test exists
- **Confidence:** HIGH
- **Evidence:** The public layout and dashboard layout construct different `items` arrays for `PublicHeader`. There is no test verifying that both layouts produce the same set of navigation items (same hrefs, same labels). If a developer adds a nav item to one layout but not the other, there is no automated check to catch it.
- **Suggested fix:** Add a component test or unit test that verifies both layouts produce the same set of `items` hrefs.

## CR13-TE2 — [LOW] No test for `getDropdownItems` capability-based filtering (carried from AGG-8/D22)

- **File:** No test file for `getDropdownItems`
- **Confidence:** MEDIUM
- **Evidence:** The function filters dropdown items based on capabilities with a role-name fallback. Without tests, a regression in capability filtering would not be caught.
- **Suggested fix:** Extract `getDropdownItems` to a separate testable module and add unit tests for various capability combinations and the fallback path.

## CR13-TE3 — [LOW] No test for `mapUserToAuthFields` return type completeness vs `AuthUserRecord` (carried from D21)

- **File:** `tests/unit/auth/recruiting-token.test.ts` exists but does not test field completeness
- **Confidence:** MEDIUM
- **Evidence:** After the cycle 12 refactoring, `authorizeRecruitingToken` delegates to `mapUserToAuthFields`, reducing the risk of field mismatches. However, there is no test verifying that `mapUserToAuthFields` returns all fields defined in `AuthUserRecord`.
- **Suggested fix:** Add a test that calls `mapUserToAuthFields` with a fully populated input and asserts that the returned object has all keys from `AuthUserRecord`.

## CR13-TE4 — [LOW] `syncTokenWithUser` manual field assignments not tested for completeness

- **File:** No test verifying all `AUTH_TOKEN_FIELDS` are set on the JWT token
- **Confidence:** LOW
- **Evidence:** `syncTokenWithUser` manually assigns each field to the token object. If a new field is added to `mapUserToAuthFields` but not to `syncTokenWithUser`, the token will silently miss it. No test catches this.
- **Suggested fix:** Add a test that calls `syncTokenWithUser` and verifies all fields from `AUTH_TOKEN_FIELDS` (except `authenticatedAt`) are present on the resulting token.

---

## Final Sweep

- Test coverage for the auth module is reasonable. The `recruiting-token.test.ts` file exists and was updated in cycle 12.
- Rate limit tests cover the core functions.
- SSE route tests exist but are integration-level (require DB).
- Component tests exist for some UI components but not for `PublicHeader`.
