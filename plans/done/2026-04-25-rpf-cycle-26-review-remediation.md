# RPF Cycle 26 Review Remediation Plan

**Date:** 2026-04-25
**Source:** `.context/reviews/_aggregate-cycle-26.md`
**Status:** In Progress

## Scope

This cycle addresses new findings from the cycle-26 multi-perspective review:
- AGG-1: `rateLimitedResponse` sidecar path uses `Date.now()` — cycle 25 AGG-3 fix was never applied
- AGG-2: Analytics student progression and participant timeline use raw scores without late penalties
- AGG-3: SSE stale connection cleanup uses O(n) linear scan

No cycle-26 review finding is silently dropped. No new refactor-only work is added under deferred.

---

## Implementation lanes

### H1: Fix `rateLimitedResponse` sidecar path to use DB-consistent time (AGG-1)

- **Source:** AGG-1 (CR-1, S-1, A-1, C-1, V-1, D-1, TE-1)
- **Severity / confidence:** HIGH / HIGH
- **Cross-agent signal:** 7 of 8 review perspectives
- **Citations:** `src/lib/security/api-rate-limit.ts:123, 162, 196`
- **Problem:** The `rateLimitedResponse` function defaults `nowMs` to `Date.now()`, and two callers (sidecar rejection paths at lines 162 and 196) omit `nowMs`, causing the `X-RateLimit-Reset` header to be computed from app-server time instead of DB-server time. This violates the repo's invariant that all rate-limit and deadline comparisons use DB server time. The cycle 25 plan AGG-3 was marked DONE but the fix was never applied.
- **Plan:**
  1. Make `nowMs` a required parameter in `rateLimitedResponse` (remove `= Date.now()` default).
  2. In `consumeApiRateLimit` (line 162): when the sidecar rejects, call `await getDbNowMs()` and pass the result as `nowMs` to `rateLimitedResponse`.
  3. In `consumeUserApiRateLimit` (line 196): same pattern — call `await getDbNowMs()` and pass as `nowMs`.
  4. Add a test verifying the `X-RateLimit-Reset` header uses DB-consistent time in both rejection paths.
  5. Verify all gates pass.
- **Status:** DONE

### L1: Add late-penalty scoring to analytics progression and participant timeline (AGG-2)

- **Source:** AGG-2 (CR-2, CR-3, A-2, C-2, V-2, TE-2)
- **Severity / confidence:** LOW / MEDIUM
- **Cross-agent signal:** 6 of 8 review perspectives
- **Citations:** `src/lib/assignments/contest-analytics.ts:261`, `src/lib/assignments/participant-timeline.ts:229`
- **Problem:** The analytics student progression and participant timeline compute scores from raw submission data without applying late penalties, while the leaderboard and status page use `buildIoiLatePenaltyCaseExpr`. This creates observable inconsistency for instructors comparing views.
- **Plan:**
  1. In `contest-analytics.ts`, apply the same late-penalty logic to the student progression score computation. Use the existing `mapSubmissionPercentageToAssignmentPoints` function from `scoring.ts` (which was updated in cycle 25 to support windowed exams) for the per-submission adjusted score.
  2. In `participant-timeline.ts`, apply late-penalty logic to the `bestScore` computation, or add a `bestAdjustedScore` alongside the raw `bestScore`.
  3. Update the existing comments that acknowledge the gap to reflect that the gap is now closed.
  4. Verify all gates pass.
- **Status:** DONE

---

## Deferred items

### DEFER-26-1: SSE stale connection cleanup O(n) linear scan (AGG-3)

- **Source:** AGG-3 (P-1, P-2)
- **Severity / confidence:** LOW / LOW
- **Cross-agent signal:** 2 of 8 review perspectives
- **Citations:** `src/app/api/v1/submissions/[id]/events/route.ts:44-53, 116-124`
- **Reason for deferral:** Performance optimization, not a correctness issue. At current scale (MAX_TRACKED_CONNECTIONS = 1000), the O(n) scan is negligible. Would require a significant data structure change (min-heap) for marginal benefit.
- **Exit criterion:** If `MAX_TRACKED_CONNECTIONS` is increased above 10,000 or profiling shows cleanup as a bottleneck, revisit with a sorted data structure.

### DEFER-1 through DEFER-14: Carried from cycle 24 plan

All prior deferred items (DEFER-1 through DEFER-14 from cycle 24 plan) remain unchanged. See the cycle 24 plan for full details.

---

## Progress log

- 2026-04-25: Plan created from cycle-26 aggregate review. 3 findings, 2 fix tasks, 1 deferred.
- 2026-04-25: Both fixes implemented and committed. H1 (rateLimitedResponse sidecar path), L1 (analytics/timeline late penalties). All gates pass: eslint, tsc --noEmit, vitest run, next build.
