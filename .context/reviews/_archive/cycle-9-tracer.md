# Tracer — Cycle 9 (Loop 9/100)

**Date:** 2026-04-24
**HEAD commit:** 524d59de

## Methodology

Causal tracing of suspicious flows, competing hypotheses for potential failures.

## Findings

**No new findings this cycle.** All critical flows traced and verified correct.

### Flows Traced This Cycle

1. **Access code redemption flow**: User submits code -> `redeemAccessCode()` -> DB transaction with `SELECT NOW()` -> atomic insert with unique constraint -> auto-enrollment -> response. All steps verified correct.

2. **Problem import flow**: Client file picker -> 10MB client check -> `JSON.parse` -> `apiFetch` to `/api/v1/problems/import` -> `createApiHandler` with auth/CSRF/rate-limit -> Zod validation -> `createProblemWithTestCases`. All steps verified correct.

3. **Contest scoring flow**: Request -> 30s TTL cache check -> stale-while-revalidate with failure cooldown -> `rawQueryAll` with parameterized SQL -> ranking computation -> cache store. All steps verified correct.

4. **SSE re-auth flow**: Poll callback -> `Date.now()` interval check -> async IIFE `getApiUser` -> if null `close()`, else process status -> `return` prevents synchronous processing. Verified correct (fix from prior loop confirmed).

## Files Reviewed

`src/lib/assignments/access-codes.ts`, `src/app/api/v1/problems/import/route.ts`, `src/lib/assignments/contest-scoring.ts`, `src/app/api/v1/submissions/[id]/events/route.ts`, `src/app/(dashboard)/dashboard/problems/problem-import-button.tsx`
