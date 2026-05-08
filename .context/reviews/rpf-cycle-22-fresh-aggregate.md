# Cycle 22 Fresh Aggregate Review

**Date:** 2026-04-24
**Base commit:** 2d729234
**Review artifacts:** `rpf-cycle-22-fresh-code-reviewer.md`

## Deduped Findings (sorted by severity then signal)

### AGG-1: Contest stats route uses raw MAX(score) without late penalty -- inconsistent with leaderboard [MEDIUM/HIGH]

**Flagged by:** code-reviewer (CR-1)
**Files:** `src/app/api/v1/contests/[assignmentId]/stats/route.ts:88`
**Description:** The stats endpoint computes `best_score` as `MAX(s.score)` and uses it for both `avgScore` and `problemsSolvedCount`. For IOI contests with late penalties, this raw score does not match the adjusted score used by the leaderboard (which applies `buildIoiLatePenaltyCaseExpr`). A problem with raw score 100 but penalty-adjusted 90 shows as "solved" in stats but not in the leaderboard. The `avgScore` will also be inflated.
**Concrete failure scenario:** An IOI contest with latePenalty=10%. Student submits a solution scoring 100 after the deadline. Leaderboard shows adjusted score 90 (not solved). Stats endpoint shows avgScore including the raw 100, and counts this as a solved problem. Instructors see inconsistent data.
**Fix:** Use `buildIoiLatePenaltyCaseExpr` in the `user_best` CTE for IOI contests, similar to how `contest-scoring.ts` does it. Add the `exam_sessions` LEFT JOIN and pass the `@deadline`, `@latePenalty`, `@examMode` parameters.
**Cross-agent signal:** 1 of 1 reviewer flagged this.

### AGG-2: ICPC live rank query counts all wrong attempts vs only pre-AC wrongs [LOW/MEDIUM]

**Flagged by:** code-reviewer (CR-2)
**Files:** `src/lib/assignments/leaderboard.ts:128-131`
**Description:** The `computeSingleUserLiveRank` ICPC query computes penalty as `attempt_count - has_ac`, counting ALL wrong attempts for a solved problem. The main leaderboard uses a window-function-based `wrongBeforeAc` that only counts wrong submissions before the first AC. A user who gets AC then submits again (wrong) gets a higher penalty in the live rank than in the main leaderboard.
**Concrete failure scenario:** User submits wrong (1), gets AC (2), then submits wrong again (3). Main leaderboard counts 1 wrong attempt. Live rank counts 2 wrong attempts. Penalty difference: 20 minutes.
**Fix:** Add a `wrongBeforeAc` computation to the live rank query matching the main leaderboard's window function logic.
**Cross-agent signal:** 1 of 1 reviewer flagged this.

### AGG-3: Stats endpoint has no unit tests [LOW/MEDIUM]

**Flagged by:** code-reviewer (CR-3)
**Files:** `src/app/api/v1/contests/[assignmentId]/stats/route.ts`
**Description:** The contest stats route has zero test coverage. The SQL CTEs are complex and the scoring inconsistency with the leaderboard (AGG-1) went undetected.
**Fix:** Add API route test covering: IOI with late penalties, ICPC, no submissions, single participant.
**Cross-agent signal:** 1 of 1 reviewer flagged this.

## Verified Safe / No Bug Found

- All raw `fetch()` calls in client components have been migrated to `apiFetch` (AGG-1 from prior cycle-22 is fixed).
- `access-code-manager.tsx` now uses `apiFetchJson` with proper error handling (AGG-2 from prior cycle-22 is fixed).
- `formatNumber` deprecated re-export from `datetime.ts` has been removed -- all imports use `@/lib/formatting` (AGG-3 from prior cycle-22 is fixed).
- Workers page uses `useVisibilityPolling` for tab-aware polling (AGG-5 from prior cycle-22 is fixed).
- `apiFetch` tests exist and cover header injection, dedup, and passthrough (AGG-6 from prior cycle-22 is fixed).
- No `innerHTML` usage, no `@ts-ignore`, no `as any` casts, no `eslint-disable` directives in source.
- No `console.log`/`console.error` in production code (only in JSDoc example).
- Anti-cheat heartbeat dedup correctly uses DB server time.
- System settings cache invalidation preserves previous cached values.
- Leaderboard freeze boundary uses DB server time via `getDbNowMs()`.
- SSE route has proper auth re-check intervals, connection caps, and cleanup.
- `sanitizeSubmissionForViewer` has documented hidden DB query with JSDoc.
- IOI late penalty SQL fragment is properly centralized in `scoring.ts` via `buildIoiLatePenaltyCaseExpr`.
- `contest-scoring.ts` and `leaderboard.ts` both use `buildIoiLatePenaltyCaseExpr` for consistency.
- CSP headers are properly set with nonce-based script-src.
- All `new Date()` usage in API routes is justified (DB time for boundary checks, client-provided dates for expiry).
- Participant timeline correctly uses `Promise.all` for parallel queries.
- Contest analytics correctly parallelizes independent queries.

## Agent Failures

None. The single reviewer completed successfully.
