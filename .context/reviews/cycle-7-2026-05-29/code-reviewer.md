# Cycle 7 — code-reviewer

**HEAD:** 1f06bcd0 (main) · **Date:** 2026-05-29 · **Baseline gates:** lint 0/0, tsc 0, build 0, test:unit 2465/320 PASS, lint:bash 0.

**Scope this cycle (orchestrator broadening):** contest scoring / leaderboard pipeline, score-override flow, submission/judging poll route, auth/RBAC on override + leaderboard endpoints, Rust worker `api.rs`. Re-assessed open deferred items (F3/F4/N3/DOC-C5-2) and verified cycle-6 N6-C6 reaper landed.

## NEW finding

### N7-C7 — Score overrides are silently ignored by the contest leaderboard / export / analytics — **MEDIUM · HIGH confidence (gap), MEDIUM (intent) · CONFIRMED**
- **Files:**
  - Override write + cache invalidation: `src/app/api/v1/groups/[id]/assignments/[assignmentId]/overrides/route.ts:101-128` (POST), `:206-216` (DELETE) — both call `invalidateRankingCache(assignment.id)`.
  - Ranking that the invalidation targets: `src/lib/assignments/contest-scoring.ts:197-443` (`_computeContestRankingInner`) and `src/lib/assignments/leaderboard.ts:108-235` (`computeSingleUserLiveRank`) — **neither joins nor reads `score_overrides`.**
  - Gradebook surface that DOES apply overrides: `src/lib/assignments/submissions.ts:646-709` (`getAssignmentStudentStatus` — `bestScore = overrideScore` when an override exists).
  - Downstream consumers that inherit the gap: `leaderboard/route.ts:57`, `contests/[assignmentId]/export/route.ts:60`, `assignments/contest-analytics.ts:94`, `assignments/participant-audit.ts:23`, `assignments/contest-replay.ts:68`.
- **Problem:** An instructor sets a per-problem score override (capped at the problem's max points). The gradebook (`getAssignmentStudentStatus`) honors it — `bestScore` becomes the override. But the **contest leaderboard, single-user live rank, CSV/JSON export, analytics, and participant audit** all run through `computeContestRanking`, whose SQL only aggregates raw `submissions.score`; it never references `score_overrides`. So the two instructor-facing surfaces for the SAME assignment disagree: gradebook shows the override, leaderboard shows the original judged score.
- **Intent evidence (resolves ambiguity toward "should apply"):** commit `1bbec040 fix(ranking): 🐛 invalidate ranking cache on score override upsert and delete` added the `invalidateRankingCache` calls specifically for overrides, and the route comment (`overrides/route.ts:123-127`) frames it as fixing "I changed the score but the ranking didn't update." That cache-bust is **dead/ineffective**: invalidating then recomputing yields the same override-blind result. The intended behavior is that overrides propagate to rankings; the fix was incomplete.
- **Failure scenario:** Instructor regrades a contest problem (e.g., a buggy test case was fixed, or manual partial credit). Gradebook reflects it; the contest leaderboard, the exported results CSV used for official standings, and the analytics page all keep the pre-override ranking. Standings/grades diverge — a correctness + data-integrity defect on instructor-trusted output.
- **Fix:** Apply overrides inside `computeContestRanking` exactly as the gradebook does: LEFT JOIN `score_overrides` per (user_id, problem_id) and, when present, use the override as the per-problem score (IOI: override replaces the adjusted best score; ICPC: override == problem points ⇒ solved, else unsolved). Mirror in `computeSingleUserLiveRank` so frozen-mode live rank stays consistent. Add regression tests. This makes the existing `invalidateRankingCache` calls meaningful.
- **Confidence:** HIGH that overrides are not read by the ranking path (read the full function; no `score_overrides` reference; no test asserts the omission). MEDIUM on intended behavior, but commit `1bbec040` + route comment make "apply" the documented intent.

## Re-verified
- Cycle-6 N6-C6 `stale -> offline` reaper present & correct (`heartbeat/route.ts:117-128`, `worker-staleness.ts:96-102`). Reap cutoff == active_tasks-reset cutoff (invariant pinned in tests).
- `computeFinalJudgeMetrics` score is always 2-decimal (`verdict.ts:46`), so the ICPC raw-`<100` vs ROUND-`=100` nit cannot diverge (re-confirmed: only the judge poll writes `submissions.score`; rejudge writes null; overrides write a separate table). RE-DEFER.

## Carried deferred (severity preserved): F3, F4, N3, DOC-C5-2 — preconditions unchanged.
