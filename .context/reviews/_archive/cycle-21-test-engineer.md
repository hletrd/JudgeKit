# Cycle 21 Test Engineer

**Date:** 2026-04-19
**Base commit:** 5a2ce6b4
**Angle:** Test coverage gaps, flaky tests, TDD opportunities

---

## F1: No unit tests for `computeSingleUserLiveRank` — recent fix untested

- **File**: `src/lib/assignments/leaderboard.ts:85-199`
- **Severity**: MEDIUM
- **Confidence**: HIGH
- **Description**: `computeSingleUserLiveRank` was added in cycle 19 and fixed in cycle 20 (adding windowed exam mode late penalty). There are no unit or integration tests for this function. The function contains complex SQL with multiple branches (ICPC vs IOI, windowed vs non-windowed late penalty, null deadline, no submissions). All of these branches are untested by automated tests.
- **Concrete failure scenario**: A future change to the IOI live rank query breaks the windowed late penalty branch. Without tests, this regression is not caught until a student reports a rank discrepancy during a live contest.
- **Fix**: Add integration tests covering: (1) IOI live rank without late penalty, (2) IOI live rank with non-windowed late penalty, (3) IOI live rank with windowed late penalty, (4) ICPC live rank, (5) user with no submissions returns null, (6) tie-breaking behavior.

## F2: No tests for `getParticipantTimeline` — complex logic untested

- **File**: `src/lib/assignments/participant-timeline.ts:88-303`
- **Severity**: MEDIUM
- **Confidence**: MEDIUM
- **Description**: `getParticipantTimeline` has complex logic for computing `wrongBeforeAc`, `bestScore`, `firstAcAt`, and `timeToFirstAc` with different behavior for ICPC vs IOI scoring models. None of this logic is covered by automated tests.
- **Concrete failure scenario**: A change to the `isFirstAc` function breaks the ICPC branch (status === "accepted" check). Without tests, this is caught only when an instructor notices incorrect timeline data.
- **Fix**: Add unit tests for the `wrongBeforeAc` calculation, `isFirstAc` function behavior, and `sortTimeline` ordering.

## F3: No tests for anti-cheat NaN limit/offset handling

- **File**: `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:148-149`
- **Severity**: LOW
- **Confidence**: HIGH
- **Description**: As noted by the code reviewer, the `limit` and `offset` parsing uses `Number()` which produces `NaN` for non-numeric input. `Math.max(1, NaN)` returns `NaN`. There are no tests verifying the behavior with invalid query parameters.
- **Concrete failure scenario**: A test sends `?limit=abc` and expects either a 400 error or a default value. Instead, the query returns zero results due to `NaN` limit.
- **Fix**: Add test cases for non-numeric limit/offset values. Fix the parsing to use `parseInt` with fallback.

## F4: Existing test coverage for `contest-scoring.ts` is good but missing edge cases

- **File**: `src/lib/assignments/contest-scoring.ts`
- **Severity**: LOW
- **Confidence**: MEDIUM
- **Description**: The core scoring function `computeContestRanking` has reasonable test coverage, but the following edge cases are untested: (1) IOI contest with all-zero scores, (2) ICPC contest with `startsAt = null` (should return empty ranking), (3) contest with exactly one participant, (4) IOI tie-breaking with floating-point scores that differ by less than 0.01.
- **Fix**: Add edge case tests for these scenarios.
