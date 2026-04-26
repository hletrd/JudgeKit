# RPF Cycle 25 Review Remediation Plan

**Date:** 2026-04-25
**Source:** `.context/reviews/_aggregate-cycle-25.md`
**Status:** Done

## Scope

This cycle addresses new findings from the cycle-25 multi-perspective review:
- AGG-1: Windowed-exam late-penalty scoring missing from `getAssignmentStatusRows`
- AGG-2: TypeScript-level `mapSubmissionPercentageToAssignmentPoints` misses windowed-exam branch
- AGG-3: `rateLimitedResponse` uses `Date.now()` fallback when `nowMs` is undefined

No cycle-25 review finding is silently dropped. No new refactor-only work is added under deferred.

---

## Implementation lanes

### H1: Fix windowed-exam late-penalty scoring in `getAssignmentStatusRows` (AGG-1)

- **Source:** AGG-1 (CR-1, S-1, A-1, C-1, V-1, D-1)
- **Severity / confidence:** MEDIUM / HIGH
- **Cross-agent signal:** 6 of 8 review perspectives
- **Citations:** `src/lib/assignments/submissions.ts:568-578`
- **Problem:** The inline CASE expression in `getAssignmentStatusRows` only applies late penalties against the global deadline. It does not apply penalties against the per-user `personal_deadline` for windowed exams. This causes the assignment status page to show unpenalized scores for windowed-exam students who submitted after their personal deadline but before the global deadline, while the leaderboard correctly shows penalized scores.
- **Plan:**
  1. Add `LEFT JOIN exam_sessions es ON es.assignment_id = s.assignment_id AND es.user_id = s.user_id` to the CTE in `getAssignmentStatusRows`.
  2. Replace the inline CASE expression with a call to `buildIoiLatePenaltyCaseExpr("s.score", "COALESCE(ap.points, 100)", "s.submitted_at", "es.personal_deadline")`.
  3. Pass `examMode` and `latePenalty` as named parameters to the raw query (they are already fetched in `assignment.examMode` and `assignment.latePenalty`).
  4. Add a source-grep test verifying `buildIoiLatePenaltyCaseExpr` is used in `getAssignmentStatusRows`.
  5. Verify all gates pass.
- **Status:** DONE

### L1: Add windowed-exam support to `mapSubmissionPercentageToAssignmentPoints` (AGG-2)

- **Source:** AGG-2 (A-1, C-2, TE-2)
- **Severity / confidence:** LOW / MEDIUM
- **Cross-agent signal:** 3 of 8 review perspectives
- **Citations:** `src/lib/assignments/scoring.ts:13-28`
- **Problem:** `mapSubmissionPercentageToAssignmentPoints` compares `submittedAt > deadline` but does not check `personalDeadline`. While this function appears unused in production scoring paths, it is exported and could be called by future code. It should handle the windowed-exam case for correctness.
- **Plan:**
  1. Add an optional `personalDeadline` parameter to `mapSubmissionPercentageToAssignmentPoints` in the `lateContext` object.
  2. When `personalDeadline` is provided, compare `submittedAt > personalDeadline` instead of `submittedAt > deadline` for the late check.
  3. Add a deprecation comment noting that `buildIoiLatePenaltyCaseExpr` is the canonical source of truth for SQL-level scoring.
  4. Verify all gates pass.
- **Status:** DONE

### L2: Make `nowMs` required in `rateLimitedResponse` (AGG-3)

- **Source:** AGG-3 (CR-2, V-2)
- **Severity / confidence:** LOW / MEDIUM
- **Cross-agent signal:** 2 of 8 review perspectives
- **Citations:** `src/lib/security/api-rate-limit.ts:125`
- **Problem:** `rateLimitedResponse` uses `(nowMs ?? Date.now())` for the `X-RateLimit-Reset` header. Both current callers always pass `nowMs` from `atomicConsumeRateLimit` (which uses `getDbNowMs()`), so the fallback is dead code. However, the function signature allows `nowMs` to be undefined, creating a latent risk that a future caller could omit it and produce an inaccurate reset timestamp due to clock skew.
- **Plan:**
  1. Make `nowMs` a required parameter in `rateLimitedResponse`.
  2. Update both callers (`consumeApiRateLimit` and `consumeUserApiRateLimit`) to pass the required parameter (they already do).
  3. Verify all gates pass.
- **Status:** DONE

---

## Deferred items

### DEFER-1 through DEFER-14: Carried from cycle 24 plan

All prior deferred items (DEFER-1 through DEFER-14 from cycle 24 plan) remain unchanged. See the cycle 24 plan for full details.

---

## Progress log

- 2026-04-25: Plan created from cycle-25 aggregate review. 3 findings, 3 fix tasks, 0 deferred.
- 2026-04-25: All 3 fixes implemented and committed. H1 (submissions.ts), L1 (scoring.ts + tests), L2 (api-rate-limit.ts). All gates pass: eslint, tsc --noEmit, vitest run (2194/2194), next build. Baseline bumped to 126.
