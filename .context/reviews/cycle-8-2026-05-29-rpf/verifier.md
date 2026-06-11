# Cycle 8 — verifier lens

**HEAD:** db1a28d0. Baseline re-run: lint 0/0, tsc 0, test:unit 2470 pass / 321 files, lint:bash 0.

## Evidence-based confirmation of N8-C8-LIVERANK

Claim under test: "the IOI single-user live rank uses the same scoring logic as the full board" (`leaderboard.ts:197` docstring; asserted structurally by `leaderboard-live-rank-logic.test.ts:39-43`).

Verification by code reading:
1. `scoring.ts:138-165` `buildIoiLatePenaltyCaseExpr` returns a CASE evaluated **per submission row** (no aggregate). Confirmed.
2. Full board, `contest-scoring.ts:233-235`: `MAX( buildIoiLatePenaltyCaseExpr(...) ) AS "bestScore"`, and `GROUP BY user_id, problem_id, ...` (line 242). Per-problem best. Then JS sum at `contest-scoring.ts:433`. Confirmed.
3. Live rank, `leaderboard.ts:213-222`: `ROUND(SUM( buildIoiLatePenaltyCaseExpr(...) ), 2) AS total_score`, `GROUP BY s.user_id` (line 222). No per-problem grouping. Confirmed.

Therefore the claim is FALSE for the IOI branch: full board = sum of per-problem maxima; live rank = sum of all rows. The two diverge whenever any user has more than one terminal submission per problem (the normal case in a contest). CONFIRMED bug, HIGH confidence.

The in-code comment `leaderboard.ts:202-203` independently corroborates: "it currently SUMs adjusted scores across submission rows rather than per-problem bests." This is documented behavior that contradicts the function's own correctness docstring and the structural test's claim.

ICPC branch cross-check: `leaderboard.ts:150-160` `user_score` CTE GROUPs BY `user_id, problem_id` with `MAX(has_ac)` / `MIN(first_ac_at)` — per-problem aggregation is correct there. Only IOI is affected. Confirmed.

## Existing test gap
`leaderboard-live-rank-logic.test.ts` and `contest-leaderboard-live-rank-implementation.test.ts` are 100% structural (readFileSync + string match). Neither asserts the per-problem-best semantics, so neither would catch this. The fix must add a guard test (structural at minimum: assert a per-problem-best CTE / `MAX(` aggregate exists in the IOI branch and that the outer aggregate is `SUM` over the per-problem CTE, not over raw rows).

## Verdict
N8-C8-LIVERANK confirmed. All other prior-cycle resolved items re-spot-checked: time route uses getDbNowMs (resolved), recruiting plaintext token removed (resolved), worker stale->offline reaper present (cycle-6 N6-C6, commit 01e8ec07). No regressions.
