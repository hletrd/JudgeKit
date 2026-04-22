# Test Engineer Review — RPF Cycle 8

**Date:** 2026-04-22
**Reviewer:** test-engineer
**Base commit:** 55ce822b

## Findings

### TE-1: No unit tests for `comment-section.tsx` — silent failure on `!response.ok` is untested [LOW/MEDIUM]

**File:** `src/app/(dashboard)/dashboard/submissions/[id]/_components/comment-section.tsx`

**Description:** The comment section component has no unit tests. The `handleCommentSubmit` function silently swallows `!response.ok` responses, but this bug is not caught by tests because no tests exist. The fetch error path (network error) and the submit error path (non-OK response) should both be tested.

**Fix:** Add unit tests covering: successful comment submission, 403 forbidden response, 413 payload too large, network error, successful fetch, failed fetch.

**Confidence:** HIGH

---

### TE-2: No tests for `participant-anti-cheat-timeline.tsx` polling reset behavior [LOW/LOW]

**File:** `src/components/contest/participant-anti-cheat-timeline.tsx`

**Description:** The anti-cheat timeline has no unit tests for the interaction between `fetchEvents` and `loadMore`. The polling reset bug (fetchEvents replacing events loaded by loadMore) is not caught by tests.

**Fix:** Add integration tests that verify: (1) loadMore appends events, (2) subsequent fetchEvents call does not discard loaded events.

**Confidence:** MEDIUM

---

## Final Sweep

Test coverage for core hooks (useSubmissionPolling, useVisibilityPolling) remains a deferred item from cycle 1. The most impactful test gap is the comment section, where the silent failure on `!response.ok` could be caught by a unit test.
