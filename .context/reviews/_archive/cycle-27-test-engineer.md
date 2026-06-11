# Cycle 27 Test Engineer

**Date:** 2026-04-22
**Base commit:** 14025d58

## Findings

### TE-1: No test coverage for dev-only `console.error` gating convention [LOW/MEDIUM]

**Description:** The codebase convention (documented in `src/lib/api/client.ts:23`) says "Log errors in development only". Error boundary components and `create-problem-form.tsx` follow this convention by gating `console.error`/`console.warn` behind `process.env.NODE_ENV === "development"`. However, there are no tests verifying that this convention is followed. With 14+ ungated `console.error` calls still present, a test would help prevent regressions.

**Failure scenario:** A developer adds a new `console.error` call without the dev-only guard. No test catches the violation.

**Fix:** Add a lint rule or a test that scans client components for ungated `console.error`/`console.warn` calls. Alternatively, create a shared `devLog` utility that encapsulates the guard and test that utility.

**Confidence:** LOW

### TE-2: No test for `admin-config.tsx` double `.json()` regression [LOW/LOW]

**File:** `src/lib/plugins/chat-widget/admin-config.tsx`

**Description:** The double `.json()` pattern in the test-connection handler has no test coverage. If someone refactors the error handling and removes the early return, the second `.json()` call would throw `TypeError: Body already consumed` with no test catching it.

**Fix:** Add a unit test for the test-connection handler that verifies the "parse once" behavior.

**Confidence:** LOW

## Verified Safe

- Full test suite passes: 294 test files, 2104 tests, 0 failures.
- The recruit-page-metadata test is properly fixed and passing.
- Security tests cover timing-safe comparisons, rate limiting, and env validation.
