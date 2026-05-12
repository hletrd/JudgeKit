# Test Engineer — Cycle 4 Test Coverage Review

## C4-TEST-1: Source-inspection tests remain unfixed

**File:** `tests/unit/assignments/participant-timeline-logic.test.ts`
**Severity:** MEDIUM | Confidence: High

Same finding as C3-TEST-1. The test file was updated in cycle 3 to verify the transaction wrapper, but it still reads source code as strings. No function logic is exercised.

**Fix:** Create real unit tests with mocked DB queries.

---

## C4-TEST-2: No test for access-codes.ts transaction isolation

**File:** `src/lib/assignments/access-codes.ts`
**Severity:** MEDIUM | Confidence: High

The `redeemAccessCode` function has a `rawQueryOne` call inside a transaction block (line 133 inside line 108's transaction). There are no tests verifying that the NOW() query participates in transaction isolation, or that it has been moved outside the transaction.

**Fix:** Add a source-inspection or implementation test that verifies no `rawQueryOne` call exists inside the transaction block.

---

## C4-TEST-3: No test for raw query helper client parameter

**File:** `src/lib/db/queries.ts`
**Severity:** LOW | Confidence: High

The `client` parameter added in cycle 3 has no test coverage. No test verifies that passing a custom client uses that client instead of the global pool.

**Fix:** Add unit tests for `rawQueryOne` and `rawQueryAll` with a mock client parameter.
