# Cycle 21 Critic

**Date:** 2026-04-19
**Base commit:** 5a2ce6b4
**Angle:** Multi-perspective critique of the whole change surface

---

## F1: Scoring SQL duplication between `contest-scoring.ts` and `leaderboard.ts` is the highest-risk architectural debt

- **File**: `src/lib/assignments/contest-scoring.ts:139-197` and `src/lib/assignments/leaderboard.ts:149-188`
- **Severity**: MEDIUM
- **Confidence**: HIGH
- **Description**: This is a cross-cutting concern flagged by both the architect and code reviewer. The cycle 20 fix that added windowed late penalty to `computeSingleUserLiveRank` proves this duplication is actively causing bugs. The two SQL fragments must stay in sync, but there is no mechanical enforcement. This is the most important finding to address this cycle because: (1) it already caused a real bug, (2) it's in a user-facing feature (live rank), and (3) it will recur whenever scoring logic changes.
- **Fix**: Extract the IOI scoring CASE expression into a shared SQL fragment builder function.

## F2: `participant-audit.ts` full-leaderboard-for-one-user pattern is wasteful but mitigated by cache

- **File**: `src/lib/assignments/participant-audit.ts:13`
- **Severity**: MEDIUM
- **Confidence**: HIGH
- **Description**: Cross-agent agreement: both code-reviewer and perf-reviewer flagged this. The contest-scoring cache mitigates the worst case (repeated calls within the TTL), but cold-cache performance is O(n) for an O(1) need. The risk is that as contests grow larger, this becomes a latency bottleneck for instructors opening student audit views.
- **Fix**: Consider adding a single-user query variant, or at minimum documenting the performance characteristic.

## F3: `contest-analytics.ts` `adjustedScore` naming is misleading

- **File**: `src/lib/assignments/contest-analytics.ts:242`
- **Severity**: LOW
- **Confidence**: HIGH
- **Description**: The variable `adjustedScore` in the student progression code does NOT include late penalties, unlike the "adjusted score" in the leaderboard. This naming inconsistency is a maintenance trap. A developer reading the analytics code might assume `adjustedScore` matches the leaderboard's adjusted score, and make incorrect decisions based on that assumption.
- **Fix**: Rename to `rawScaledScore` and update the comment to be clearer.

## F4: Missing tests for `computeSingleUserLiveRank` — highest test-debt item

- **File**: `src/lib/assignments/leaderboard.ts:85-199`
- **Severity**: MEDIUM
- **Confidence**: HIGH
- **Description**: This function was added and then fixed (cycle 19 and 20) without any automated tests. The windowed late penalty fix proves the code is complex enough to warrant tests. Without tests, future changes to this function are high-risk.
- **Fix**: Add integration tests for the IOI live rank with windowed late penalty, non-windowed late penalty, ICPC mode, and null/empty submissions.

## Cross-Agent Agreement Summary

| Finding | Flagged By | Highest Severity |
|---------|------------|------------------|
| Scoring SQL duplication | architect, critic | MEDIUM |
| Full-leaderboard-for-one-user | code-reviewer, perf-reviewer, critic | MEDIUM |
| Missing live rank tests | test-engineer, critic | MEDIUM |
| `adjustedScore` naming | code-reviewer, critic | LOW |
| Anti-cheat NaN limit/offset | code-reviewer, test-engineer | LOW |
