# Cycle 49 — Test Engineer

**Date:** 2026-05-12
**HEAD reviewed:** `17a35892`
**Scope:** Test coverage and quality analysis

---

## Findings

### C49-TEST-1: [LOW] New `participant-timeline-bar.tsx` component has no unit tests

**File:** `src/components/contest/participant-timeline-bar.tsx`
**Confidence:** HIGH

The new unified timeline bar component (363 lines) has no associated test file. While it is primarily presentational, it contains non-trivial logic:
- Event flattening and sorting
- Time percentage calculations
- Duration formatting
- Conditional rendering based on event types

**Risk:** Regression in timeline visualization if the component logic changes.

**Fix:** Add component tests covering:
1. Empty timeline (no events) renders fallback message
2. Single event renders at correct position
3. Multiple events from different problems render with correct colors
4. First-AC events render with checkmark icon
5. Snapshot events render as squares (not circles)
6. Tooltip content includes correct submission details

---

### C49-TEST-2: [LOW] `participant-timeline.ts` — no tests for edge cases

**File:** `src/lib/assignments/participant-timeline.ts`
**Confidence:** MEDIUM

The timeline data function has no explicit tests for:
1. Participant with no submissions (empty timeline)
2. ICPC vs IOI first-AC detection logic difference
3. Wrong-before-AC counting with backdated submissions
4. Late penalty application in `bestScore` calculation
5. Null `examStartedAt` handling

**Fix:** Add integration tests for `getParticipantTimeline` covering these edge cases.

---

### C49-TEST-3: [LOW] `judge/claim/route.ts` — schema mismatch path not tested

**File:** `src/app/api/v1/judge/claim/route.ts:263-269`
**Confidence:** MEDIUM

The new zod schema validation for claimed rows includes an error-handling path:
```typescript
try {
  claimed = claimedSubmissionRowSchema.parse(claimedRaw);
} catch (parseErr) {
  logger.error({ err: parseErr, claimedRaw }, "[judge/claim] Claimed row schema mismatch");
  return apiError("invalidJudgeClaim", 422);
}
```

No test verifies that a schema mismatch returns 422 instead of crashing.

**Fix:** Add a test that mocks `rawQueryOne` to return an object with a string in a numeric field (simulating the old pg driver behavior) and assert 422 response.

---

## Verified Test Quality

- Existing test suite passes (317 files, 2399 tests) per cycle 16 verification
- No new test failures introduced by recent changes
- The `__test_internals` export pattern in `analytics/route.ts` provides clean test-only API surface

---

## No Agent Failures

Single-agent comprehensive review (subagent fan-out unavailable).
