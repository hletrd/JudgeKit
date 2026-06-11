# Cycle 51 — Architect

**Date:** 2026-04-23
**Base commit:** 778a019f
**Reviewer:** architect

## Inventory of Reviewed Files

- `src/lib/assignments/contest-scoring.ts` (full)
- `src/lib/assignments/leaderboard.ts` (full)
- `src/lib/assignments/recruiting-invitations.ts` (full)
- `src/lib/assignments/exam-sessions.ts` (full)
- `src/lib/assignments/participant-status.ts` (full)
- `src/lib/assignments/scoring.ts` (full)
- `src/lib/realtime/realtime-coordination.ts` (full)
- `src/lib/security/api-rate-limit.ts` (full)
- `src/lib/security/in-memory-rate-limit.ts` (full)
- `src/proxy.ts` (full)
- `src/app/api/v1/submissions/[id]/events/route.ts` (full)
- `src/app/api/v1/contests/[assignmentId]/analytics/route.ts` (full)
- `src/app/api/v1/judge/claim/route.ts` (full)
- `src/lib/db-time.ts` (reference)

## Findings

No new architectural findings this cycle.

### Carry-Over Confirmations

- **ARCH-2:** Manual routes duplicate createApiHandler boilerplate (MEDIUM/MEDIUM) — deferred. The SSE route (`submissions/[id]/events/route.ts`) manually implements auth, rate limiting, and error handling that `createApiHandler` provides. This is necessary because SSE uses streaming responses incompatible with the standard handler pattern.
- **ARCH-3:** Stale-while-revalidate cache pattern duplication (LOW/LOW) — deferred. Identical cache-then-refresh logic in `contest-scoring.ts:96-130` and `analytics/route.ts:53-84`. A shared utility would reduce duplication.

## Architectural Observations

The `Date.now()` to `getDbNowUncached()` migration is complete across all critical paths. The remaining `Date.now()` uses in server code fall into well-defined, documented categories:

1. **In-memory-only caches** (contest-scoring TTL, analytics TTL, system-settings TTL, capability cache) — appropriate, no DB comparison needed
2. **Client-side code** (countdown timer, sidebar, submission form) — appropriate, no server-side clock skew concern
3. **Deferred hot-path items** (`atomicConsumeRateLimit`) — explicitly deferred due to DB round-trip cost
4. **Health/ops endpoints** (admin-health, time, health) — appropriate for their purpose
5. **Single-process coordination** (in-memory rate limit, SSE connection tracking, circuit breaker) — appropriate when shared coordination is not active

The `buildIoiLatePenaltyCaseExpr` extraction in `scoring.ts` is a good pattern — it's the single source of truth for the late-penalty SQL fragment used in both `contest-scoring.ts` and `leaderboard.ts`, ensuring they stay in sync.
