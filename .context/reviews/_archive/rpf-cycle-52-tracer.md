# Cycle 52 — Tracer

**Date:** 2026-04-23
**Base commit:** 1117564e
**Reviewer:** tracer

## Inventory of Reviewed Files

- `src/lib/assignments/recruiting-invitations.ts` (full — causal trace of redeemRecruitingToken)
- `src/lib/assignments/exam-sessions.ts` (full — causal trace of startExamSession)
- `src/app/api/v1/submissions/[id]/events/route.ts` (full — causal trace of SSE lifecycle)
- `src/proxy.ts` (full — causal trace of auth middleware)
- `src/lib/realtime/realtime-coordination.ts` (full — causal trace of shared coordination)
- `src/lib/auth/config.ts` (full — causal trace of JWT callback)

## Findings

No new findings this cycle.

### Causal Traces

#### Trace 1: Recruiting Token Redemption

1. Client sends `recruitToken` + `recruitAccountPassword` to `/api/auth/[...nextauth]`
2. `authorize()` in config.ts detects `recruitToken`, calls `authorizeRecruitingToken()`
3. `authorizeRecruitingToken()` calls `redeemRecruitingToken()` which starts a DB transaction
4. Inside the transaction: read invitation by tokenHash, validate status/expiry via atomic SQL UPDATE
5. If UPDATE returns no rows: throw "alreadyRedeemed" → caught → return error
6. If UPDATE succeeds: create user, enrollment, access token, and return user object
7. Back in `authorize()`: `createSuccessfulLoginResponse()` maps user fields + login event context
8. JWT callback: `syncTokenWithUser()` writes all auth fields to token

**Verdict:** No causal gap. The flow is atomic and correctly handles all error paths.

#### Trace 2: SSE Connection Lifecycle

1. GET request arrives → auth check → rate limit → connection slot acquisition
2. If terminal state: return single event + release slot
3. If in-progress: create ReadableStream with poll subscriber
4. `close()` function handles cleanup: unsubscribe from poll, release connection slot, close controller
5. `abort` event triggers close, timeout triggers close, terminal result triggers close
6. Re-auth check every 30s: if user deactivated, close connection

**Verdict:** No causal gap. The connection lifecycle is properly managed with idempotent cleanup.

#### Trace 3: Proxy Auth Middleware

1. Request arrives → `getToken()` extracts JWT
2. If protected route + has token: build cache key from `userId:authenticatedAtSeconds`
3. Check FIFO cache → if miss, query DB via `getActiveAuthUserById()`
4. If active user found: cache it and continue
5. If no active user + API key present: pass through to route handler
6. If no active user + no API key: redirect to login (web) or return 401 (API)
7. UA hash mismatch: audit log only, no hard reject

**Verdict:** No causal gap. The proxy correctly handles all auth states.

### Carry-Over Confirmations

All deferred items from prior cycles remain valid.
