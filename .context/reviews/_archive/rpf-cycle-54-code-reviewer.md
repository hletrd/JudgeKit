# Cycle 54 — Code Reviewer

**Date:** 2026-04-23
**Base commit:** 21db1921
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

No new code quality findings this cycle. HEAD (21db1921) is a documentation-only advance from cycle 53's base (1117564e): the delta is confined to cycle 53 review notes and plan file. No production-code changes have landed since the prior cycle.

### Carry-Over Confirmations

- **CR-2:** Manual routes duplicate createApiHandler boilerplate (MEDIUM/MEDIUM) — deferred. Stable and intentional for streaming/custom response paths.
- **CR-3:** Global timer HMR pattern duplication (LOW/MEDIUM) — deferred.
- **CR-4:** Stale-while-revalidate cache pattern duplication (LOW/LOW) — deferred.
- **CR-5:** Console.error in client components (LOW/MEDIUM) — deferred.

### Code Quality Observations

1. No new non-null assertions (`!.`) introduced in server code. The only remaining `!.`-like occurrences are in comments ("any admin"), not runtime code.
2. No new `as any` casts in production code.
3. Only one `eslint-disable` in the codebase (plugin-config-client.tsx) with a valid justification comment.
4. ICPC tie-breaker with deterministic userId.localeCompare continues to work as intended.
5. `buildIoiLatePenaltyCaseExpr` remains single source of truth for IOI late-penalty SQL fragment.
6. `getDbNowUncached()` consistently applied for cross-process time decisions; `Date.now()` usage remains limited to in-memory caches, client-side UI, health probes, and explicit infra counters.
