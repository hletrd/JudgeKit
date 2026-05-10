# Cycle 17 Test Engineering Review

**Date:** 2026-05-08
**Base commit:** 919c8ba3
**Reviewer angle:** Test coverage, flaky tests, TDD opportunities

## Scope
- Unit tests (`tests/unit/`)
- Component tests (`tests/component/`)
- Test infrastructure and patterns

## Findings

### C17-TEST-1 — [LOW] No test coverage for `handleSignOutWithCleanup` error path

- **Severity:** LOW (test gap)
- **Confidence:** HIGH
- **Files:** `src/lib/auth/sign-out.ts:75-89`
- **Evidence:** The `handleSignOutWithCleanup` function has a try/catch around `signOut()` that resets `isSigningOut(false)` on failure. There are no tests verifying that the loading state is properly reset when sign-out fails.
- **Failure scenario:** A future refactor changes the error handling in `handleSignOutWithCleanup` but no test catches the regression. The sign-out button could get stuck in a loading state.
- **Suggested fix:** Add a unit test that mocks `signOut` to throw and verifies `setIsSigningOut` is called with `false`.

### C17-TEST-2 — [LOW] Component tests for `public-header.tsx` do not cover mobile menu focus trap

- **Severity:** LOW (test gap)
- **Confidence:** HIGH
- **Files:** `src/components/layout/public-header.tsx:105-129`
- **Evidence:** The public-header component has a focus trap implementation for the mobile menu (Tab/Shift+Tab wrapping). No component tests verify this behavior.
- **Failure scenario:** A future refactor breaks the focus trap logic. Keyboard users lose focus management in the mobile menu.
- **Suggested fix:** Add component tests that simulate Tab and Shift+Tab key events in the mobile menu and verify focus wraps correctly.

## Verified Covered

- Cycle 16 fixes (create-problem-form refs, public-header RAF) have corresponding tests
- All major UI components have component tests
- API routes have integration tests
- 314 unit test files, 2338 tests passing
- 66 component test files, 179 tests passing

## Final Sweep

- Checked for missing test coverage on recently modified files — minor gaps identified above
- No test files with `test.skip` or `test.only` found
- No relevant files were skipped.
