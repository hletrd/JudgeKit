# Cycle 8 — code-reviewer lens

**HEAD:** db1a28d0 (main). Baseline gates green: lint 0/0, tsc 0, build n/a-yet, test:unit 2470/321 PASS, lint:bash 0.

## Scope
Ranking subsystem internals (orchestrator-directed broadening): `src/lib/assignments/leaderboard.ts`, `contest-scoring.ts`, `scoring.ts`, leaderboard route, override route. Cross-checked the IOI/ICPC scoring symmetry between the full board and the single-user live-rank query.

## NEW finding

### N8-C8-LIVERANK — IOI `computeSingleUserLiveRank` SUMs adjusted score over ALL submission rows instead of per-problem best — MEDIUM · HIGH confidence · CONFIRMED · NOT DEFERRABLE
- **File:** `src/lib/assignments/leaderboard.ts:210-223` (the IOI `user_scores` CTE).
- **Problem:** The IOI live-rank query computes
  `ROUND(SUM(<buildIoiLatePenaltyCaseExpr per-row>), 2) AS total_score ... GROUP BY s.user_id`.
  `buildIoiLatePenaltyCaseExpr` (`scoring.ts:149-164`) returns a **per-row** adjusted-score CASE. Grouping only by `user_id` and SUMming therefore adds up the adjusted score of *every terminal submission row*, across every problem and every resubmission of the same problem.
  The authoritative full board (`contest-scoring.ts:233-235`) instead computes `MAX(<same expr>)` GROUP BY `(user_id, problem_id)` (per-problem best) and then sums the per-problem bests in JS (`contest-scoring.ts:433`).
- **Failure scenario:** Student submits problem A three times scoring 40/70/100 and problem B twice scoring 50/80.
  - Full board total = MAX(A)=100 + MAX(B)=80 = **180**.
  - Live-rank total = 40+70+100+50+80 = **340**.
  The inflation factor depends on how many times each user resubmits, so it differs per user and does NOT cancel out in the comparison `WHERE ROUND(us.total_score,2) > ROUND(t.total_score,2)`. A student who resubmits a lot is ranked far better than their true standing. The docstring (line 197) and the structural test (`leaderboard-live-rank-logic.test.ts`) both claim it "uses the same scoring logic as contest-scoring.ts" — it does not.
- **Why net-new:** Prior cycles (N7-C7 / N7-C7-ICPC) tracked only the *score_overrides overlay* gap. The underlying SUM-vs-MAX scoring error is independent: it corrupts the IOI live rank even with zero overrides. The in-code comment at lines 202-203 acknowledges the SUM-over-rows shape but frames it solely as a blocker for the override overlay, not as the live-rank correctness defect it is.
- **Fix:** Restructure the IOI `user_scores` CTE to a per-problem-best inner aggregate, mirroring the full board:
  ```sql
  WITH per_problem AS (
    SELECT s.user_id, s.problem_id,
           MAX(<buildIoiLatePenaltyCaseExpr>) AS best
    FROM submissions s
    INNER JOIN assignment_problems ap ON ...
    LEFT JOIN exam_sessions es ON ...
    WHERE s.assignment_id = @assignmentId AND s.status IN (...)
    GROUP BY s.user_id, s.problem_id
  ),
  user_scores AS (
    SELECT user_id, ROUND(SUM(COALESCE(best,0)), 2) AS total_score
    FROM per_problem GROUP BY user_id
  )
  ```
  Keep the existing target/rank comparison unchanged. This makes the live rank agree with the full board (override-free case) exactly. The deferred override overlay (N7-C7) remains separately tracked — the per-problem CTE makes it feasible later but is NOT in scope for the correctness fix.
- **NOT DEFERRABLE:** scoring/correctness invariant; user-visible wrong rank.

## Other observations (no action)
- ICPC live-rank penalty (`leaderboard.ts:168`) uses `EXTRACT(EPOCH FROM first_ac_at)::bigint / 60` = minutes-since-Unix-epoch, not minutes-since-contest-start. The constant epoch offset is identical for all users, cancels in the rank comparison, and the function returns only the rank (never the absolute penalty), so the ICPC rank is correct. Pre-existing quirk, NOT net-new, no action.
- Override route (`overrides/route.ts:128,216`) correctly calls `invalidateRankingCache`. No issue.
