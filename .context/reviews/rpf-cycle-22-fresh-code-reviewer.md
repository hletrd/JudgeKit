# Cycle 22 Fresh Code Review

**Date:** 2026-04-24
**Base commit:** 2d729234
**Reviewer:** code-reviewer (fresh pass)

## Findings

### CR-1: Contest stats route uses raw MAX(score) without late penalty — inconsistent with leaderboard [MEDIUM/HIGH]

**File:** `src/app/api/v1/contests/[assignmentId]/stats/route.ts:88`
**Description:** The stats endpoint computes `best_score` as `MAX(s.score)` (line 88) and uses it for both `avgScore` (line 103) and `problemsSolvedCount` (line 107-110). For IOI contests with late penalties, this raw score does not match the adjusted score used by the leaderboard (which applies `buildIoiLatePenaltyCaseExpr`). A problem with raw score 100 but penalty-adjusted 90 shows as "solved" in stats but not in the leaderboard. The `avgScore` will also be inflated.
**Concrete failure scenario:** An IOI contest with latePenalty=10%. Student A submits a solution scoring 100 after the deadline. Leaderboard shows adjusted score 90 (not solved). Stats endpoint shows avgScore including the raw 100, and counts this as a solved problem. Instructors see inconsistent data.
**Fix:** Use `buildIoiLatePenaltyCaseExpr` in the `user_best` CTE for IOI contests, similar to how `contest-scoring.ts` does it. Add the `exam_sessions` LEFT JOIN and pass the `@deadline`, `@latePenalty`, `@examMode` parameters.
**Confidence:** HIGH

### CR-2: ICPC live rank query counts all wrong attempts vs only pre-AC wrongs [LOW/MEDIUM]

**File:** `src/lib/assignments/leaderboard.ts:128-131`
**Description:** The `computeSingleUserLiveRank` ICPC query computes penalty as `EXTRACT(EPOCH FROM us.first_ac_at)::bigint / 60 + 20 * (us.attempt_count - us.has_ac)`. The `attempt_count - has_ac` counts ALL wrong attempts for a solved problem. But the main leaderboard (`contest-scoring.ts` line 177-179) uses a window-function-based `wrongBeforeAc` that only counts wrong submissions before the first AC. A user who gets AC then submits again (wrong) gets a higher penalty in the live rank than in the main leaderboard.
**Concrete failure scenario:** User submits wrong (1), gets AC (2), then submits wrong again (3). Main leaderboard counts 1 wrong attempt (wrongBeforeAc). Live rank counts 2 wrong attempts (3-1=2). Penalty difference: 20 minutes.
**Fix:** Add a `wrongBeforeAc` computation to the live rank query matching the main leaderboard's window function logic. Low priority — post-AC re-submissions are rare in ICPC.
**Confidence:** MEDIUM

### CR-3: Stats endpoint has no unit tests [LOW/MEDIUM]

**File:** `src/app/api/v1/contests/[assignmentId]/stats/route.ts`
**Description:** The contest stats route has zero test coverage. The SQL CTEs are complex and the scoring inconsistency with the leaderboard (CR-1) went undetected. A test verifying that stats match leaderboard scoring for IOI with late penalties would have caught CR-1.
**Fix:** Add API route test covering: IOI with late penalties, ICPC, no submissions, single participant.
**Confidence:** HIGH
