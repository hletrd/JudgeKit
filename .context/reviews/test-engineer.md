# Test Engineering Review — Cycle 20

**Date:** 2026-05-09
**HEAD:** e9ff5e04
**Agent:** test-engineer (manual)

---

## T20-1: [LOW] Missing test coverage for zod error message mismatch in public signup

- **Severity:** LOW
- **Confidence:** HIGH
- **File:** `src/lib/actions/public-signup.ts:73`
- **Summary:** The `registerPublicUser` function casts zod error messages directly to `PublicSignupResult["error"]`. There are no tests verifying that unexpected zod messages (e.g., from a future schema change) are handled gracefully. The existing tests likely only cover the known validation paths.
- **Fix:** Add a test that mocks `publicSignupSchema.safeParse` returning an unknown error message, and assert that the function falls back to `"createUserFailed"` instead of propagating the unexpected string.

## T20-2: [LOW] Missing test for malformed JSON body in recruiting validate endpoint

- **Severity:** LOW
- **Confidence:** HIGH
- **File:** `src/app/api/v1/recruiting/validate/route.ts:23`
- **Summary:** The endpoint silently swallows JSON parse errors. There is likely no test for a request with a truncated or invalid JSON body, since the code path treats all parse failures identically.
- **Fix:** Add a test sending `Content-Type: application/json` with body `"not json"` and assert a distinct error response (after fixing C20-2).

## T20-3: [LOW] Missing test for invalid compiler time limit in executeCompilerRun

- **Severity:** LOW
- **Confidence:** MEDIUM
- **File:** `src/lib/compiler/execute.ts:528-545`
- **Summary:** No tests verify the behavior when `compilerTimeLimitMs` is `NaN`, negative, or Infinity. The `AbortSignal.timeout(NaN)` path is untested.
- **Fix:** Add tests mocking `getConfiguredSettings()` with invalid `compilerTimeLimitMs` values and assert graceful fallback.

---

## Deferred / No Findings

- All 380 component/unit tests pass (314 unit + 66 component).
- No flaky test patterns detected in newly reviewed code.
- Test coverage for timer cleanup and AbortController disposal is adequate based on prior cycle fixes.
