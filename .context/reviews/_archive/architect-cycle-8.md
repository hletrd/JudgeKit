# Architect — Cycle 8 (Loop 8/100)

**Date:** 2026-04-24
**HEAD commit:** c5644a05

## Methodology

Architectural risk review: coupling, layering, abstraction boundaries, scalability constraints, and design patterns. Cross-cutting concerns: auth, rate-limiting, SSE, compiler execution, DB access patterns.

## Findings

**No new architectural findings this cycle.**

### Architectural Observations (Carry-Over)

1. **AGG-7 / ARCH-2: Manual routes duplicate `createApiHandler` boilerplate** — Most routes use the `createApiHandler` wrapper, but SSE (`events/route.ts`), backup, restore, and migrate-import routes have manual auth/CSRF/rate-limit logic. This is architecturally sound for SSE (streaming response) and backup/restore (multipart form-data with password re-confirmation), but the duplication could be reduced with composable middleware functions. Severity: MEDIUM/MEDIUM. Deferred.

2. **ARCH-3: Stale-while-revalidate cache pattern duplication** — `system-settings-config.ts`, `contest-scoring.ts`, and `analytics/route.ts` all implement similar "cache with TTL + background refresh" patterns. Could be extracted into a shared utility. Severity: LOW/LOW. Deferred.

3. **Global timer HMR pattern duplication** — Multiple modules use `globalThis.__xxxTimer` for HMR-safe timer management (SSE cleanup, audit prune, data retention prune). Pattern is correct but duplicated. Severity: LOW/MEDIUM. Deferred.

4. **Rate-limiting dual module** — `rate-limit.ts` (login-focused, DB-backed with exponential backoff) vs `api-rate-limit.ts` (API-focused, sidecar + DB-backed, fixed block). `in-memory-rate-limit.ts` adds a third path for server actions. The split is intentional (different semantics) but the naming and documentation could clarify when to use which. Severity: LOW/MEDIUM. Deferred.

### Architectural Strengths

- Clean separation between proxy (Edge runtime) and API routes (Node.js runtime)
- `createApiHandler` wrapper encapsulates auth, CSRF, rate-limit, Zod validation, and error handling
- DB-time abstraction via `getDbNow`/`getDbNowUncached`/`getDbNowMs` is well-applied across all temporal comparisons
- Realtime coordination is properly abstracted with shared vs. process-local backends
- Recruiting token flow is transactionally atomic with SQL-level claim validation

## Files Reviewed

`src/lib/api/handler.ts`, `src/lib/api/auth.ts`, `src/proxy.ts`, `src/lib/realtime/realtime-coordination.ts`, `src/lib/security/api-rate-limit.ts`, `src/lib/security/rate-limit.ts`, `src/lib/security/in-memory-rate-limit.ts`, `src/lib/system-settings-config.ts`, `src/lib/assignments/contest-scoring.ts`, `src/app/api/v1/contests/[assignmentId]/analytics/route.ts`, `src/app/api/v1/submissions/[id]/events/route.ts`, `src/lib/db-time.ts`
