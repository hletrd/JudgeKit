# Cycle 7 — tracer (causal tracing, competing hypotheses)

**Flow traced:** instructor score-override → what each consuming surface displays.

## Hypotheses for the override→leaderboard disconnect

- **H1 (bug, incomplete fix):** overrides are supposed to affect rankings; `computeContestRanking` was never updated to read `score_overrides`, and the `invalidateRankingCache` call (commit `1bbec040`) is a dead remedy. — **SUPPORTED.** Commit `1bbec040` exists solely to bust the ranking cache on override mutation; the route comment cites the exact bug report ("changed the score but the ranking didn't update"). If rankings were intentionally override-blind, that commit and comment would be nonsensical. The gradebook (`submissions.ts:707-709`) already overlays overrides, proving the project's own model is "override = effective score for that user/problem."
- **H2 (intentional, gradebook-only):** contest rankings deliberately reflect only judged submissions for fairness, and overrides are a separate gradebook concept. — **WEAKLY SUPPORTED, but contradicted by H1 evidence.** No test, doc, or comment states this. The `invalidateRankingCache` call directly contradicts it.

H1 wins on evidence weight. Net: confirmed correctness gap N7-C7 (MEDIUM). Recommended trace-driven fix: overlay `score_overrides` in the ranking SQL/aggregation, mirroring `getAssignmentStudentStatus`.

## Secondary trace — judge poll IN_PROGRESS vs FINAL result writes
- IN_PROGRESS branch (`poll/route.ts:96-103`) replaces `submission_results` only when `results.length > 0`; the FINAL branch (`:161-166`) unconditionally deletes then re-inserts (`buildSubmissionResultRows` returns `[]` for empty, so no insert). This is consistent — an empty FINAL report clears stale interim results, which is correct (a compile-error final verdict legitimately has no per-test results). No defect. The `activeTasks` decrement happens only on the FINAL branch (`:168-175`), matching the claim-side increment. Correct.

No further net-new findings from tracing.
