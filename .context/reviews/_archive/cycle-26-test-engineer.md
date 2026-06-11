# Cycle 26 Test Engineer Review

**Date:** 2026-04-20
**Base commit:** 660ae372

---

## TE-1: Flaky test — `recruit-page-metadata.test.ts` second test case times out [HIGH/HIGH]

**Files:** `tests/unit/recruit-page-metadata.test.ts:42`
**Description:** Running `npx vitest run` produces 1 failure: the test "uses generic metadata for valid public invite tokens instead of leaking assignment titles" times out at the 5000ms default. The test uses dynamic `import()` to load the page module, which re-triggers module-level side effects. The `generateMetadata` function calls `getRecruitingInvitationByToken` which in turn calls `db` — the mock for `@/lib/db` provides `dbSelectMock` but the actual function uses `db.select().from().where().limit()` which doesn't match the simple `dbSelectMock` mock. The module-level `import()` causes the mock to not be properly applied.
**Concrete failure scenario:** CI gate fails because this test times out on every run.
**Fix:** Refactor the test to use static imports with `vi.mock` hoisting (standard Vitest pattern), or if dynamic imports are needed, ensure all transitive dependencies are properly mocked. Also consider adding a longer timeout as a stopgap.

## TE-2: No test coverage for duplicate invitation lookup in recruit page [MEDIUM/MEDIUM]

**Files:** `src/app/(auth)/recruit/[token]/page.tsx:19,56`
**Description:** The recruit page calls `getRecruitingInvitationByToken(token)` twice (once in `generateMetadata`, once in the page component). There is no test verifying that both calls sites return consistent results, or testing the scenario where the invitation state changes between the two calls (e.g. token is revoked between metadata generation and page render).
**Concrete failure scenario:** A race condition where an invitation is valid during metadata generation but revoked by the time the page component renders could result in the page showing content that contradicts its own metadata.
**Fix:** Add a test that mocks `getRecruitingInvitationByToken` to return different results on successive calls, verifying the page handles the discrepancy gracefully.

## TE-3: Test suite passes 287/288 files with 2026/2027 tests — one consistent failure [MEDIUM/HIGH]

**Files:** `tests/unit/recruit-page-metadata.test.ts`
**Description:** The vitest run shows 1 failed test consistently. This is a blocking gate issue for any CI pipeline.
**Fix:** Fix TE-1 to unblock the test suite.

---

## Test coverage observations

- 288 test files with 2027 tests is good coverage.
- Unit tests cover validators, security, auth, capabilities, API routes, DB helpers, and more.
- Component tests exist for key UI components.
- E2E tests cover critical user flows.
