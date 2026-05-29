# Cycle 7 — verifier (evidence-based correctness)

**HEAD:** 1f06bcd0 · Baseline gates all green (2465 tests).

## Claim under test: "Setting a score override updates what instructors and students see for that assignment."

**Verdict: PARTIALLY FALSE — confirmed defect N7-C7.**

Evidence chain:
1. Override POST writes `score_overrides` and calls `invalidateRankingCache(assignment.id)` — `overrides/route.ts:111-128`.
2. The ranking cache it invalidates is produced by `computeContestRanking` — `contest-scoring.ts:132-191` (cache keyed `${assignmentId}:${cutoffSec ?? 'live'}`).
3. `_computeContestRankingInner` builds its scoring SQL (`buildScoringQuery`, `contest-scoring.ts:201-244`) from `submissions`, `assignment_problems`, `users`, `exam_sessions` ONLY. Grepped the whole function + `leaderboard.ts` — **zero** references to `score_overrides`.
4. By contrast `getAssignmentStudentStatus` (`submissions.ts:646-709`) explicitly overlays `overrideMap` onto `bestScore`. So the gradebook honors the override; the leaderboard does not.
5. No unit/integration test asserts that the leaderboard ignores overrides (grepped `tests/`), so the omission is not a tested design decision.

Therefore: the cache invalidation added in `1bbec040` is a no-op with respect to its stated goal — recomputing produces the same override-blind ranking. Instructor's manual score change is visible in the gradebook but NOT in the leaderboard, export CSV, analytics, participant-audit, or replay.

**Severity:** MEDIUM (instructor-facing correctness / standings integrity; no security or data-loss; no remote exploit). **Confidence:** HIGH (gap), MEDIUM (intended behavior — but commit msg + route comment document the intent).

## Re-verified true claims
- N6-C6 reaper: `shouldMarkWorkerOffline === shouldResetActiveTasks` (delegation, `worker-staleness.ts:96-102`); combined sweep UPDATE reaps `status='stale' AND last_heartbeat_at < cutoff` to offline+deregistered+active_tasks=0 (`heartbeat/route.ts:117-128`). Reversible via unconditional `status='online'` on next heartbeat. TRUE.
- Judge final score is 2-decimal (`verdict.ts:46`). TRUE → ICPC raw/rounded `wrongBeforeAc` cannot diverge. Re-defer informational nit.
