# Cycle 12 — Debugger

**Date:** 2026-04-19
**Base commit:** 2339c7ea

## Findings

### CR12-DB1 — [MEDIUM] `authorizeRecruitingToken` silently sets `mustChangePassword: false` — latent forced-password-change bypass

- **File:** `src/lib/auth/recruiting-token.ts:62`
- **Confidence:** HIGH
- **Evidence:** When a user authenticates via a recruiting token, `mustChangePassword` is hardcoded to `false`. If the admin has flagged the user for a mandatory password change, this auth path bypasses it. The proxy layer (proxy.ts line 307-312) checks `activeUser.mustChangePassword`, but only sees the value from the JWT session — which was set to `false` by this function.
  - Failure scenario: Admin flags user X for password reset. User X opens a recruiting invitation link. They log in successfully with `mustChangePassword: false`. They access the dashboard without ever changing their password.
- **Suggested fix:** Read `mustChangePassword` from the DB query result (add it to the columns list) and pass the actual value.

### CR12-DB2 — [LOW] SSE `onPollResult` re-auth IIFE can fire after `close()` — redundant async operations

- **File:** `src/app/api/v1/submissions/[id]/events/route.ts:325-381`
- **Confidence:** MEDIUM
- **Evidence:** The re-auth check fires in an async IIFE (line 325). Between the `void (async () => {` start and the `await getApiUser(request)` call, the connection could be closed by another event (timeout, abort). The `if (closed) return` on line 339 catches this, but the DB query in `getApiUser` has already been made. This is a minor resource waste, not a correctness bug.
- **Suggested fix:** Check `if (closed) return` before the async IIFE starts the DB query.

### CR12-DB3 — [LOW] `blockedUntil || null` falsy coercion in rate-limit functions

- **File:** `src/lib/security/rate-limit.ts:215,225,253`
- **Confidence:** MEDIUM
- **Evidence:** Using `|| null` treats `0` as falsy, converting it to `null`. While `blockedUntil = 0` is effectively "not blocked" and semantically equivalent to `null`, the pattern is inconsistent with `consumeRateLimitAttemptMulti` which uses `blockedUntil > 0 ? blockedUntil : null`. If a future change causes `blockedUntil` to be computed as `0` (e.g., `now + blockDuration` where blockDuration is 0), the `|| null` pattern would lose the distinction between "no block" and "block at epoch 0".
- **Suggested fix:** Use `blockedUntil > 0 ? blockedUntil : null` consistently across all three functions.

## Previously Fixed (Verified This Cycle)

- Cycle 11 AGG-6/7: SSE stream close guards — VERIFIED (closed checks present)
