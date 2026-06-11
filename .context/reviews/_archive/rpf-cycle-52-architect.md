# Cycle 52 — Architect

**Date:** 2026-04-23
**Base commit:** 1117564e
**Reviewer:** architect

## Inventory of Reviewed Files

- `src/lib/assignments/contest-scoring.ts` (full)
- `src/lib/assignments/leaderboard.ts` (full)
- `src/lib/assignments/recruiting-invitations.ts` (full)
- `src/lib/assignments/exam-sessions.ts` (full)
- `src/lib/assignments/scoring.ts` (reference)
- `src/lib/realtime/realtime-coordination.ts` (full)
- `src/lib/security/api-rate-limit.ts` (full)
- `src/proxy.ts` (full)
- `src/app/api/v1/submissions/[id]/events/route.ts` (full)
- `src/app/api/v1/contests/[assignmentId]/analytics/route.ts` (full)
- `src/app/api/v1/contests/quick-create/route.ts` (full)
- `src/app/api/v1/groups/[id]/assignments/[assignmentId]/route.ts` (full)

## Findings

No new architectural findings this cycle.

### Carry-Over Confirmations

- **ARCH-2:** Manual routes duplicate createApiHandler boilerplate (MEDIUM/MEDIUM) — deferred. The SSE route manually implements auth, rate limiting, and error handling that `createApiHandler` provides. This is necessary because SSE uses streaming responses incompatible with the standard handler pattern.
- **ARCH-3:** Stale-while-revalidate cache pattern duplication (LOW/LOW) — deferred. Identical cache-then-refresh logic in `contest-scoring.ts` and `analytics/route.ts`. A shared utility would reduce duplication.

### Architectural Observations

1. The `Date.now()` to `getDbNowUncached()` migration is complete across all critical paths. The remaining `Date.now()` uses fall into well-defined, documented categories: in-memory-only caches, client-side code, deferred hot-path items, health/ops endpoints, and single-process coordination.

2. The quick-create route properly creates a hidden group + assignment + assignment problems in a single transaction, maintaining referential integrity.

3. The realtime coordination module properly handles both single-instance (in-memory) and multi-instance (PostgreSQL advisory lock) deployment modes, with appropriate warnings and guards.

4. The proxy middleware properly separates concerns: locale resolution, auth cache, CSP headers, and HSTS are all handled in distinct, well-named functions.
