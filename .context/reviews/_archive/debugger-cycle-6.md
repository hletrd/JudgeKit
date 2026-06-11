# Debugger — Cycle 6 (Loop 6/100)

**Date:** 2026-04-24
**HEAD commit:** 4ec394c2 (cycle 5 multi-agent review + remediation)

## Methodology

Latent bug surface analysis: error-handling gaps, failure modes, race conditions, edge cases, and regression risks. Focus on paths where errors could propagate silently or cause incorrect behavior.

## Findings

**No new latent bug findings.** No source code has changed since cycle 5.

### Failure Mode Analysis

1. **JWT callback failure on `getDbNowMs()`**: If the DB is unreachable at sign-in time, `getDbNowMs()` throws (by design — `getDbNowUncached` throws on null result). This causes the JWT callback to fail, which prevents sign-in. This is correct behavior — a fallback to `Date.now()` would reintroduce the clock-skew vulnerability. The user sees a sign-in error, which is preferable to a silently incorrect token.

2. **SSE stream re-auth failure**: If `getApiUser(request)` throws during the periodic re-auth check (line 402), the connection is closed. This is correct — a closed connection is safer than continuing to stream data to a potentially revoked user. The `.catch()` on the IIFE prevents unhandled rejections.

3. **Rate-limiter sidecar unreachable**: The sidecar returns `null`, and the code falls back to the DB path. This is correct — fail-open for availability, with the DB as the source of truth. The sidecar never blocks a request when unreachable.

4. **Encryption key rotation**: If `NODE_ENCRYPTION_KEY` is rotated, previously encrypted data becomes undecryptable. The `decrypt()` function throws on invalid format, and `authTag` verification (AES-GCM) ensures tampered data is rejected. There is no key-versioning system, but this is an operational concern, not a code bug.

5. **Orphaned Docker containers**: The compiler cleanup logic handles `docker inspect` failures gracefully (skip the container). Stale containers older than 10 minutes are force-removed. The `pLimit` concurrency limiter prevents resource exhaustion from concurrent execution requests.

### Edge Cases Reviewed

- Empty/missing JWT token fields: `getTokenAuthenticatedAtSeconds` returns `null`, which `isTokenInvalidated` handles as "not invalidated" (safe default — allows valid sessions).
- Missing `origin` header with no `sec-fetch-site`: CSRF check requires `origin` when `sec-fetch-site` is absent and `expectedHost` is known (line 56-58 in csrf.ts). This correctly blocks cross-origin requests from older browsers.
- Recruiting token with null `expiresAt`: `redeemRecruitingToken` uses `sql`(expires_at IS NULL OR expires_at > NOW())`` which correctly treats null as "never expires".

## Carry-Over

All deferred items from cycle 5 aggregate remain valid and unchanged.
