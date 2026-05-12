# Test Engineer Review — Cycle 5

**Reviewer:** test-engineer
**Date:** 2026-05-12

---

## Finding 1: No test for judge claim problem-not-found race condition

**File:** `src/app/api/v1/judge/claim/route.ts:352-374`
**Severity:** MEDIUM
**Confidence:** High

The judge claim route handles the case where a claimed submission's problem no longer exists. This is an edge case that can occur when:
- A problem is deleted between submission and claim
- Database inconsistency

There is no test coverage for this path. The race condition (reset outside transaction) is particularly dangerous and untested.

**Fix:** Add a unit test that mocks the problem lookup to return null, verifies the submission is reset to pending, and verifies active_tasks is decremented.

---

## Finding 2: Source-inspection tests still present

**File:** `tests/unit/assignments/participant-timeline-logic.test.ts`
**Severity:** MEDIUM
**Confidence:** High

Same finding as C3-AGG-3 / C4-AGG-3. The test file reads source code as strings and checks substring presence. It never exercises actual function logic. The file was updated in cycle 3 to verify the transaction wrapper exists but still provides no confidence in correctness.

**Fix:** Replace with real unit tests that mock the DB layer and call `getParticipantTimeline` with test data.

---

## Finding 3: Missing test for cache invalidation

**File:** `src/lib/assignments/contest-scoring.ts`
**Severity:** LOW
**Confidence:** Medium

There is no test verifying that the LRU cache invalidates or updates when submissions change. The cache TTL is 30s with stale-while-revalidate at 15s, but no tests verify this behavior.

**Fix:** Add tests for cache hit, miss, stale hit, and background refresh.

---

## Finding 4: No test for Docker build path validation

**File:** `src/lib/docker/client.ts:62-72`
**Severity:** LOW
**Confidence:** Medium

The `validateDockerfilePath` function has no direct unit tests. It is tested indirectly via the build route tests, but edge cases (path traversal, prefix bypass) lack coverage.

**Fix:** Add unit tests for `validateDockerfilePath` with various attack inputs.
