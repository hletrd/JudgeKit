# Test Engineer Review — Cycle 16/100

**Reviewer:** test-engineer (manual)
**Date:** 2026-05-08
**HEAD:** 5aef3f6f
**Scope:** Test coverage gaps for ref cleanup, RAF cleanup, and component test completeness

---

## NEW FINDINGS

### C16-TE-1 — Missing tests for create-problem-form ref cleanup [LOW]
- **Severity:** LOW
- **Confidence:** MEDIUM
- **File:** `src/app/(public)/problems/create/create-problem-form.tsx`
- **Problem:** There are no tests verifying that test-case file input refs are properly cleaned up when test cases are removed. The `removeTestCase` function could fail to clean up refs, leading to stale entries, but this is not exercised in tests. The `el!` non-null assertion in callback refs is also not covered.
- **Fix:** Add a component test that adds test cases, removes one, and verifies the ref arrays are cleaned up.

### C16-TE-2 — Missing tests for public-header RAF cleanup [LOW]
- **Severity:** LOW
- **Confidence:** LOW
- **File:** `src/components/layout/public-header.tsx`
- **Problem:** The `closeMobileMenu` RAF is not covered by tests. While the current callback is safe, tests should verify focus management behavior.
- **Fix:** Add test coverage for mobile menu close + focus restoration.

## Test Coverage Status

| Area | Coverage | Notes |
|---|---|---|
| CountdownTimer deadline reactivity | Good | Tests added in prior cycle |
| SubmissionDetailClient abort cleanup | Good | Tests added in cycle 14 |
| AcceptedSolutions concurrent fetch | Good | Tests added in cycle 14 |
| CopyCodeButton timer | Good | Tests added in cycle 14 |
| CreateProblemForm ref cleanup | Missing | No test coverage for ref lifecycle |
| PublicHeader RAF cleanup | Missing | No test coverage for focus RAF |

## Previously Deferred (NOT re-reported)

- Env-blocked integration tests — deferred pending CI provisioning
