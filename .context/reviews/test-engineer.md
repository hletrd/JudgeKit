# Test Engineer

**Date:** 2026-04-20
**Base commit:** 52d81f9d
**Angle:** Test coverage gaps, flaky tests, TDD opportunities

## Inventory
- Component coverage: `tests/component/pagination-controls.test.tsx`, `tests/component/home-page.test.tsx`, `tests/component/not-found-page.test.tsx`
- E2E coverage: `tests/e2e/public-shell.spec.ts`, `tests/e2e/rankings.spec.ts`
- Production-failing code: `src/components/pagination-controls.tsx`, `src/app/page.tsx`, `src/app/not-found.tsx`

## F1: The pagination component test suite encoded the broken async API instead of guarding against it
- **File:** `tests/component/pagination-controls.test.tsx:34-68`
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **Status:** confirmed issue
- **Description:** The test mocks `next-intl/server` and calls `await PaginationControls(...)` directly. That means the test suite normalized the invalid async client-component shape instead of flagging it.
- **Concrete failure scenario:** Production rejects the component boundary while the component test suite keeps passing because it never renders the component the way Next.js does.
- **Suggested fix:** Refactor the component to a normal client component and update the test to render `<PaginationControls ... />` with a client-side translation mock.

## F2: Public-shell E2E coverage does not guard the live regression on `/rankings`, and it does not assert absence of the public error shell
- **File:** `tests/e2e/public-shell.spec.ts:24-45`
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **Status:** confirmed issue
- **Description:** The suite checks `/practice` but not `/rankings`, and even the `/practice` test only asserts the expected heading instead of also asserting that the global server-error shell is absent.
- **Concrete failure scenario:** `/practice` and `/rankings` can regress into the public error shell while the suite still misses half the blast radius.
- **Suggested fix:** Add coverage for `/rankings` and explicitly fail on the server-error shell for both routes.

## Final sweep
- The current failure escaped because both component and E2E coverage validated happy paths without validating the actual Next.js rendering contract.
