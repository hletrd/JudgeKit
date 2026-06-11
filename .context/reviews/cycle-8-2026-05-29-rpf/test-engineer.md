# Cycle 8 — test-engineer lens

**HEAD:** db1a28d0. test:unit baseline 2470 pass / 321 files.

## Test gap behind N8-C8-LIVERANK
`tests/unit/assignments/leaderboard-live-rank-logic.test.ts` and `tests/unit/contest-leaderboard-live-rank-implementation.test.ts` are entirely structural (readFileSync + `toContain`). They assert SQL fragments exist (`buildIoiLatePenaltyCaseExpr`, `LEFT JOIN exam_sessions`, `1 + COUNT(*)`, tie-break clauses) but NEVER assert the per-problem-best aggregation shape. That is precisely why the SUM-over-rows defect went undetected: the wrong query still contains all the matched fragments.

## Required test (ships with the fix)
Add structural guards to `leaderboard-live-rank-logic.test.ts` IOI section:
1. Assert a per-problem-best aggregate exists in the IOI branch (e.g. `MAX(` inside the IOI `user_scores`/`per_problem` CTE, GROUP BY `s.user_id, s.problem_id`).
2. Assert the outer per-user aggregate SUMs the per-problem bests, NOT raw rows (i.e. the `SUM(` no longer wraps `buildIoiLatePenaltyCaseExpr` directly with `GROUP BY s.user_id` only).
3. Add a guard comment documenting the per-problem-best invariant so future edits can't silently regress to SUM-over-rows.

These are structural (no DB), consistent with the existing test style and the repo's documented constraint that `computeSingleUserLiveRank` SQL "is not feasible to unit-test without integration infrastructure."

## No other NEW test findings
DEFER-ENV-GATES (DB-backed integration tests) unchanged → re-defer.
