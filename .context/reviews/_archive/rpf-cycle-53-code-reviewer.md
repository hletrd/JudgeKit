# Cycle 53 — Code Reviewer

**Date:** 2026-04-23
**Base commit:** 1117564e
**Reviewer:** code-reviewer

## Inventory of Reviewed Files

- `src/proxy.ts` (full)
- `src/lib/assignments/leaderboard.ts` (full)
- `src/lib/assignments/contest-scoring.ts` (full)
- `src/lib/assignments/recruiting-invitations.ts` (full)
- `src/lib/assignments/exam-sessions.ts` (full)
- `src/lib/security/api-rate-limit.ts` (full)
- `src/lib/security/in-memory-rate-limit.ts` (full)
- `src/lib/security/sanitize-html.ts` (full)
- `src/lib/realtime/realtime-coordination.ts` (full)
- `src/lib/auth/config.ts` (full)
- `src/app/api/v1/submissions/[id]/events/route.ts` (full)
- `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts` (full)
- `src/app/api/v1/contests/[assignmentId]/analytics/route.ts` (full)
- `src/app/api/v1/contests/quick-create/route.ts` (full)
- `src/app/api/v1/groups/[id]/assignments/[assignmentId]/route.ts` (full)
- `src/components/exam/anti-cheat-monitor.tsx` (full)
- `src/lib/db-time.ts` (full)

## Findings

No new code quality findings this cycle. HEAD (1117564e) is identical to the base commit reviewed in cycle 52. All observations from cycle 52 remain valid.

### Carry-Over Confirmations

- **CR-2:** Manual routes duplicate createApiHandler boilerplate (MEDIUM/MEDIUM) — deferred. SSE route and judge routes require streaming/custom response patterns incompatible with the standard handler.
- **CR-3:** Global timer HMR pattern duplication (LOW/MEDIUM) — deferred. Cosmetic.
- **CR-4:** Stale-while-revalidate cache pattern duplication in contest-scoring.ts and analytics/route.ts (LOW/LOW) — deferred.
- **CR-5:** Console.error in client components (LOW/MEDIUM) — deferred.

### Code Quality Observations

1. ICPC tie-breaker now applies deterministic userId.localeCompare when all prior tie-breakers match (contest-scoring.ts:358). Matches IOI pattern and is idempotent.
2. `buildIoiLatePenaltyCaseExpr` remains single source of truth for IOI late-penalty SQL fragment.
3. `computeContestRanking` properly handles ICPC with null `startsAt` (returns empty ranking with warning).
4. Quick-create route validates problemPoints/problemIds length via Zod refine and has NaN guards on date parsing.
5. No `!.` non-null assertions in server code. No `as any` casts in production code.
6. `getDbNowUncached()` is used for temporal comparisons in rate-limiting, deadline enforcement, exam session lifecycle, SSE coordination, and judge claim.
