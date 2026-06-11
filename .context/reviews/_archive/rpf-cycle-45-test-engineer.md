# Cycle 45 — Test Engineer

**Date:** 2026-04-23
**Base commit:** d96a984f

## Findings

### TE-1: No unit test for `getStudentProblemStatuses` edge case — empty problem list [LOW/LOW]

**File:** `src/lib/assignments/submissions.ts:342-387`

The `getStudentProblemStatuses` function has no test coverage for the edge case where an assignment has no problems. The function would return an empty array, which is correct, but the empty path is untested.

**Fix:** Add a test case for an assignment with no assignment problems.

---

### TE-2: No integration test for SSE connection tracking edge cases [LOW/LOW]

**File:** `src/app/api/v1/submissions/[id]/events/route.ts`

The SSE connection tracking (addConnection, removeConnection, cleanup) has no automated tests. The MAX_TRACKED_CONNECTIONS eviction logic and the stale connection cleanup are particularly important to test. However, SSE testing requires a running server and is typically tested via E2E tests.

**Fix:** Consider adding unit tests for the connection tracking functions extracted to a testable module.

---

### TE-3: Non-null assertions in client components could cause runtime crashes with no test coverage [MEDIUM/LOW]

**Files:**
- `student/[userId]/page.tsx:131`
- `submission-detail-client.tsx:85`

These non-null assertions could throw if data is inconsistent (e.g., problem deleted after submission). There are no tests covering the "missing relation" scenario. While these are unlikely in practice, the crash would be visible to the user rather than gracefully handled.

**Fix:** Replace non-null assertions with null guards and add graceful fallbacks.

---

## Summary

| ID | Severity/Confidence | Description |
|----|----|----|
| TE-1 | LOW/LOW | No test for getStudentProblemStatuses empty problem list |
| TE-2 | LOW/LOW | No integration test for SSE connection tracking |
| TE-3 | MEDIUM/LOW | Non-null assertions in client components lack test coverage |
