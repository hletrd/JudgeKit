# Cycle 20 Test Engineer Findings

**Date:** 2026-04-19
**Reviewer:** Test coverage gaps, flaky tests, TDD opportunities
**Base commit:** 95f06e5b

---

## Findings

### F1: ALS cache tests give false confidence — production code never initializes the store

- **File**: `tests/unit/recruiting/request-cache.test.ts`
- **Severity**: MEDIUM
- **Confidence**: HIGH
- **Description**: The test file for `request-cache.ts` passes all 5 test cases because each test manually calls `withRecruitingContextCache` to create the ALS context. However, no production code ever calls `withRecruitingContextCache`. The tests validate the ALS mechanism works in isolation but do not verify that the mechanism is actually wired into the application. This is a test gap that allowed a critical integration bug to go undetected.
- **Concrete failure scenario**: The test suite shows 5/5 passing for the request cache. A developer reviewing CI output assumes the ALS cache is working in production. In reality, it's completely non-functional.
- **Suggested fix**: Add an integration test that verifies `getRecruitingAccessContext` returns the same context when called twice within a single API request handler (using the actual `createApiHandler` pipeline). This would catch the "ALS not initialized" bug. Also add a test that calls `getCachedRecruitingContext` without `withRecruitingContextCache` to verify it returns `undefined` (this test already exists, but it should be flagged as a production risk).

### F2: No integration test for `canAccessProblem` in API route context verifying cache deduplication

- **File**: `src/lib/auth/permissions.ts:107-145`
- **Severity**: LOW
- **Confidence**: MEDIUM
- **Description**: There are no tests that verify `canAccessProblem` benefits from caching when called from an API route handler. The function calls `getRecruitingAccessContext` which should be cached per-request, but without an integration test, the cache effectiveness cannot be verified.
- **Suggested fix**: Add a test that calls `canAccessProblem` twice for the same user within a simulated request context and verifies the DB is queried only once for the recruiting context.

---

## Verified Safe

### VS1: `import-transfer.test.ts` covers key edge cases
- **File**: `tests/unit/db/import-transfer.test.ts`
- 8 test cases including valid JSON, file too large, malformed JSON, multi-byte content, empty JSON, arrays, custom byte limit, and floating-point precision. Good coverage.
