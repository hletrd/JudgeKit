# Verifier — Cycle 9 (RPF)

**Date:** 2026-05-29
**HEAD:** 24939e42 (main)
**Goal:** Evidence-based correctness check of the cycle-8 leaderboard fix (claimed
DONE) and the freshest email code, against stated behavior.

## Baseline gates (re-run this cycle, whole repo)
- `npm run lint` → exit 0, 0 errors / 0 warnings
- `npx tsc --noEmit` → exit 0
- `npm run lint:bash` → exit 0
- `npm run test:unit` → exit 0, **2472 tests / 321 files PASS**
(Evidence: /tmp/cycle9-*.log; background jobs b0olh9n6b, bwnb12dt1 both exit 0.)

## Verified: cycle-8 N8-C8-LIVERANK fix is correct
Claim: IOI single-user live rank now uses per-problem best (MAX per user+problem)
then per-user SUM, matching the full board.

Evidence (read both query bodies):
- **Live rank** (`leaderboard.ts:218-248`): `per_problem` CTE does
  `MAX(<buildIoiLatePenaltyCaseExpr("s.score","COALESCE(ap.points,100)","s.submitted_at","es.personal_deadline")>) ... GROUP BY s.user_id, s.problem_id`;
  `user_scores` CTE does `ROUND(SUM(COALESCE(best,0)),2) ... GROUP BY user_id`.
- **Full board** (`contest-scoring.ts:233-243`): `MAX(<buildIoiLatePenaltyCaseExpr("score","points")>)`
  as `bestScore` GROUP BY `(user_id, problem_id)`, then JS `reduce` sum
  (`contest-scoring.ts:433`).
- **Shared CASE source** (`scoring.ts:138-165`): identical late-penalty logic;
  live-rank passes `s.submitted_at` / `es.personal_deadline` explicitly, full
  board uses the defaults `submitted_at` / `personal_deadline` exposed by its
  `base` CTE. Both bind `@deadline`, `@latePenalty`, `@examMode`. **Symmetric.**
- Both filter `status IN (TERMINAL_SUBMISSION_STATUSES_SQL_LIST)` and the same
  `assignment_problems` INNER JOIN + `exam_sessions` LEFT JOIN. The live rank
  intentionally omits the `score_overrides` overlay (documented deferred N7-C7
  at `leaderboard.ts:209-215`) — an indicative-only freeze-window badge.

Verdict: fix verified correct; docstring (lines 196-215) accurately describes the
new shape. No regression.

## Verified: email subject is not a header-injection vector
See `security-reviewer.md` — nodemailer 7.0.13 strips CR/LF from the Subject
(`mime-node/index.js:1152`); HTTP providers send subject as JSON. Verified by
reading the transport source, not assumed.

## Verified: tests pin the live-rank invariant
`tests/unit/assignments/leaderboard-live-rank-logic.test.ts` (cycle-8) asserts the
`per_problem` MAX aggregate + per-user SUM structural guards. Present and green
(part of the 2472 passing).

## Verdict
All claimed-DONE work verified against the code. No correctness gap. No net-new
finding.
