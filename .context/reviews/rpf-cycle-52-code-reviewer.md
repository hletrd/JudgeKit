# Cycle 52 — Code Reviewer

**Date:** 2026-04-23
**Base commit:** 1117564e
**Reviewer:** code-reviewer

## Inventory of Reviewed Files

- `src/proxy.ts` (full)
- `src/lib/assignments/leaderboard.ts` (full)
- `src/lib/assignments/contest-scoring.ts` (full)
- `src/lib/assignments/recruiting-invitations.ts` (full)
- `src/lib/assignments/exam-sessions.ts` (full)
- `src/lib/assignments/scoring.ts` (reference)
- `src/lib/security/api-rate-limit.ts` (full)
- `src/lib/security/in-memory-rate-limit.ts` (full)
- `src/lib/security/sanitize-html.ts` (full)
- `src/lib/seo.ts` (full)
- `src/lib/realtime/realtime-coordination.ts` (full)
- `src/lib/auth/config.ts` (full)
- `src/app/api/v1/submissions/[id]/events/route.ts` (full)
- `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts` (full)
- `src/app/api/v1/contests/[assignmentId]/analytics/route.ts` (full)
- `src/app/api/v1/contests/quick-create/route.ts` (full)
- `src/app/api/v1/groups/[id]/assignments/[assignmentId]/route.ts` (full)
- `src/components/exam/anti-cheat-monitor.tsx` (full)

## Findings

No new code quality findings this cycle.

### Carry-Over Confirmations

- **CR-2:** Manual routes duplicate createApiHandler boilerplate (MEDIUM/MEDIUM) — deferred. SSE route and judge routes require streaming/custom response patterns incompatible with the standard handler.
- **CR-3:** Global timer HMR pattern duplication (LOW/MEDIUM) — deferred. Cosmetic improvement; works correctly.
- **CR-4:** Stale-while-revalidate cache pattern duplication in contest-scoring.ts and analytics/route.ts (LOW/LOW) — deferred. Stable, well-documented duplication.
- **CR-5:** Console.error in client components (LOW/MEDIUM) — deferred. No security/correctness impact.

### Code Quality Observations

1. The recruiting token redemption flow (`redeemRecruitingToken`) is well-structured: uses DB time throughout, atomic SQL UPDATE for race prevention, and clear error propagation via transaction rollback.

2. The `buildIoiLatePenaltyCaseExpr` extraction in `scoring.ts` remains the single source of truth for the late-penalty SQL fragment — consistent across `contest-scoring.ts` and `leaderboard.ts`.

3. The `computeContestRanking` function properly handles the ICPC edge case where `startsAt` is null (returns empty ranking with a warning log).

4. The quick-create route properly validates `problemPoints` array length matches `problemIds` via Zod refine, and includes NaN guards on date construction as defense-in-depth.

5. Non-null assertion audit complete — no `!.` patterns found in server code. No `as any` casts found.
