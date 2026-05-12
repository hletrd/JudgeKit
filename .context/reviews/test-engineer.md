# Test Engineer — Cycle 3 Test Coverage Review

## C3-TEST-1: `getParticipantTimeline` has no real unit tests

**File:** `src/lib/assignments/participant-timeline.ts`
**Severity:** MEDIUM | Confidence: High

The existing `tests/unit/assignments/participant-timeline-logic.test.ts` is a source-inspection test that reads the file and checks string presence. It does not exercise any function logic. The API test (`tests/unit/api/participant-timeline.route.test.ts`) mocks `getParticipantTimeline` entirely, so it doesn't test the function either.

Coverage gaps:
- ICPC vs IOI first-AC detection logic
- Late penalty application in timeline context
- `wrongBeforeAc` counting
- `sortTimeline` ordering with null timestamps
- Anti-cheat aggregation
- Best score reduction across multiple submissions

**Fix:** Create real unit tests with mocked DB queries.

---

## C3-TEST-2: `rawQueryOne` transaction bypass is untested

**File:** `src/lib/db/queries.ts`
**Severity:** LOW | Confidence: High

There are no tests verifying that `rawQueryOne` and `rawQueryAll` can accept a transaction client. The bug in `exam-sessions.ts` where `rawQueryOne` is called inside a transaction went undetected because no test exercises this path with transaction assertions.

**Fix:** Add tests for transaction-aware raw queries.
