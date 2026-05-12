# Test Engineer Review — Cycle 12 (HEAD: ecfa0b6c)

**Date:** 2026-05-11
**Reviewer:** test-engineer
**Scope:** Test coverage gaps, test quality, TDD opportunities

---

## Findings

### C12-TEST-1: No test for apiFetch timeout cleanup
**Severity:** LOW | **Confidence:** High
**File:** `src/lib/api/client.ts:97-98`

The `apiFetch` helper has two branches:
- With `init.signal`: tested (cleanupWithTimeout called in .finally)
- Without `init.signal`: NOT tested for cleanup

There is no test verifying that the timeout signal created by `createTimeoutSignal(30_000)` is properly cleaned up when the fetch completes.

**Fix:** Add a unit test that mocks `fetch` to resolve immediately and verifies `cleanupWithTimeout` is called for the default-branch signal.

---

### C12-TEST-2: normalizeSubmission edge cases not fully covered
**Severity:** LOW | **Confidence:** Medium
**File:** `src/hooks/use-submission-polling.ts:45-119`

The `normalizeSubmission` function handles various field types but lacks tests for:
- `results` array containing non-object elements
- `testCase` being an array instead of an object
- `submittedAt` being an invalid date string (Date.parse returns NaN)
- `problem.id` or `problem.title` being numbers (coerced to string by `typeof === 'string'` check, but what if they're objects?)

**Fix:** Add unit tests for these edge cases in the polling hook test suite.

---

### C12-TEST-3: countdown-timer sync error path not tested
**Severity:** LOW | **Confidence:** Medium
**File:** `src/components/exam/countdown-timer.tsx:82-109`

The `syncTime` callback has error handling (`.catch(() => { /* keep existing offset */ })`) but there is no test verifying:
- Network error during sync (keep existing offset)
- Non-JSON response (keep existing offset)
- Invalid timestamp in response (NaN check at line 97)

**Fix:** Add unit tests for sync error paths.

---

## Verified

- Existing test suites run green at HEAD.
- No flaky test patterns detected.
