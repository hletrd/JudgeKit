# Code Reviewer — Cycle 5 (Loop 5/100)

**Date:** 2026-04-24
**HEAD commit:** b7a39a76 (no source changes since cycle 4)

## Methodology

Full-file review of all source files under `src/`, focusing on code quality, logic correctness, SOLID principles, and maintainability. Cross-file interaction analysis for auth, rate-limiting, SSE, recruiting-token, and compiler execution paths.

## Findings

**No new production-code findings.** No source code has changed since cycle 4.

### Observations

1. **`Date.now()` in JWT callback `authenticatedAtSeconds`** — `src/lib/auth/config.ts:352` uses `Math.trunc(Date.now() / 1000)` to set the `authenticatedAt` timestamp on the JWT at sign-in time. This is used later in `isTokenInvalidated()` to compare against `tokenInvalidatedAt` from the DB. Clock skew between app server and DB could cause a token to be considered valid for a few seconds after password change/forced logout, or prematurely invalidated. **Severity: LOW** — the window is seconds at most, and the JWT callback fires once at sign-in; the `jwt` callback refresh path (line 390) calls `syncTokenWithUser` without overriding `authenticatedAtSeconds`, preserving the original sign-in time from DB comparison. **Confidence: MEDIUM** — marginal improvement, unlikely to cause real-world issues.

2. **`Date.now()` default in `syncTokenWithUser` parameter** — `src/lib/auth/config.ts:116` defaults `authenticatedAtSeconds` to `Math.trunc(Date.now() / 1000)` when `getTokenAuthenticatedAtSeconds(token)` returns null. This fallback should rarely fire (only on malformed tokens). **Severity: LOW** — same clock-skew class as observation 1. **Confidence: LOW** — fallback path is defensive, not actively used.

## Verified Prior Fixes

All prior fixes from cycles 37-55 and cycles 1-4 remain intact:
- `getDbNowUncached()` / `getDbNowMs()` usage in judge claim route, recruiting token, rate-limit checks
- Non-null assertion removals
- Deterministic leaderboard sorts
- Token-invalidation bypass fix
- Source-grep baseline at 121 files

## Files Reviewed

Key files examined: `src/lib/auth/config.ts`, `src/lib/security/api-rate-limit.ts`, `src/lib/api/handler.ts`, `src/lib/api/auth.ts`, `src/lib/api/api-key-auth.ts`, `src/proxy.ts`, `src/app/api/v1/submissions/[id]/events/route.ts`, `src/lib/compiler/execute.ts`, `src/lib/assignments/recruiting-invitations.ts`, `src/lib/realtime/realtime-coordination.ts`, `src/lib/security/csrf.ts`, `src/lib/security/encryption.ts`, `src/lib/files/storage.ts`, `src/lib/db-time.ts`, `src/instrumentation.ts`
