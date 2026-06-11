# Cycle 8 — document-specialist lens

**HEAD:** db1a28d0.

## Doc/code mismatch (folds into N8-C8-LIVERANK fix)
- `leaderboard.ts:196-198` docstring: "IOI: rank = 1 + count of users with higher total adjusted score / Uses the same scoring logic as contest-scoring.ts, including windowed exam mode late penalties." — This is FALSE for the aggregation shape: contest-scoring.ts uses per-problem MAX then sum; the live rank sums all rows. The fix must correct both the query AND this docstring so they agree.
- `leaderboard.ts:200-207` comment (N7-C7 note) describes the override overlay gap and mentions the SUM-over-rows shape as a blocker. After the fix, this comment must be updated: the per-problem-best CTE now exists; only the override *overlay* remains deferred (N7-C7). Update wording so it no longer reads as if SUM-over-rows is the current state.

## No other doc findings
README `/api/v1/time` doc gap (C7-DS-1) unchanged → re-defer. Plan-vs-impl reconciliation: the two open cycle-35 plans are both fully checked `[x]` and should be archived.
