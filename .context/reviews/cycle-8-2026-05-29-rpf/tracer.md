# Cycle 8 — tracer lens

**HEAD:** db1a28d0.

## Causal trace: frozen-contest student view → wrong live rank
1. `GET /api/v1/contests/[assignmentId]/leaderboard` (`route.ts:16`).
2. Non-instructor + `leaderboard.frozen` → `computeSingleUserLiveRank(assignmentId, user.id)` (`route.ts:58-61`).
3. IOI branch (`leaderboard.ts:208-243`): `user_scores` CTE `SUM(per-row adjusted)` GROUP BY user_id (line 213-222).
4. Rank = `1 + COUNT(users with higher SUM)` (line 227-232).
5. Returned as `entry.liveRank` for the current user's row (`route.ts:79`), rendered as the "live" badge (`leaderboard-table.tsx`, asserted by `contest-leaderboard-live-rank-implementation.test.ts:13-15`).

Competing hypotheses considered:
- H1 "ROUND drift" — rejected; ROUND(...,2) is applied on both sides, not the cause.
- H2 "epoch offset" (ICPC penalty line 168) — real for absolute penalty but cancels in rank comparison; ICPC unaffected for ranking.
- H3 "SUM over rows vs MAX per problem" (IOI) — CONFIRMED as the root cause; inflation factor is per-user (resubmission count), does not cancel. This is N8-C8-LIVERANK.

Conclusion: single root cause, IOI branch only, confirmed by code + the self-incriminating comment at lines 202-203.
