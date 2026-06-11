# Cycle 10 Security Reviewer Report

**Reviewer:** security-reviewer
**Date:** 2026-04-19
**Base commit:** 56e78d62
**Scope:** OWASP top 10, secrets, unsafe patterns, auth/authz

## Inventory of Files Reviewed

- `src/lib/auth/config.ts` — Authentication configuration
- `src/lib/auth/session-security.ts` — Token clearing/invalidation
- `src/lib/auth/permissions.ts` — Access control functions
- `src/lib/api/handler.ts` — API handler factory with auth/CSRF
- `src/lib/api/auth.ts` — API authentication
- `src/lib/security/encryption.ts` — AES-256-GCM encryption
- `src/lib/security/rate-limit.ts` — Rate limiting
- `src/lib/security/api-rate-limit.ts` — API rate limiting
- `src/lib/security/csrf.ts` — CSRF protection
- `src/lib/security/sanitize-html.ts` — HTML sanitization
- `src/lib/security/ip.ts` — IP extraction
- `src/lib/compiler/execute.ts` — Docker sandboxed execution
- `src/lib/realtime/realtime-coordination.ts` — SSE coordination
- `src/app/api/v1/submissions/[id]/events/route.ts` — SSE events route
- `src/app/api/v1/playground/run/route.ts` — Playground execution
- `src/app/api/v1/tags/route.ts` — Tags endpoint (rate limiting check)
- `src/app/api/metrics/route.ts` — Metrics endpoint
- `src/app/api/internal/cleanup/route.ts` — Cleanup cron endpoint
- `src/proxy.ts` — Edge middleware (auth cache, CSP, HSTS)
- `src/lib/plugins/secrets.ts` — Plugin secrets management

## Findings

### CR10-SR1 — [MEDIUM] `clearAuthToken` does not delete `authenticatedAt` in a timing-safe way — token revocation check could pass for a brief window

- **Confidence:** MEDIUM
- **File:** `src/lib/auth/session-security.ts:37-60`
- **Evidence:** `clearAuthToken` deletes `authenticatedAt` (line 56), which causes `getTokenAuthenticatedAtSeconds` to fall back to `token.iat` (line 17-20 of session-security.ts). The `iat` field is set by NextAuth when the JWT is first created and does not change across refreshes. If `tokenInvalidatedAt` is set after `clearAuthToken` runs but before the JWT is fully refreshed, the fallback to `iat` could make the token appear as if it was authenticated before the invalidation event, causing `isTokenInvalidated` to return `true` and clearing the token again (which is the desired behavior). However, if `iat` happens to be AFTER `tokenInvalidatedAt` (because the JWT was created after the invalidation), the token would NOT be cleared, allowing a session that should have been revoked to survive.
- **Failure scenario:** Admin forces a password reset for user X, setting `tokenInvalidatedAt`. The user's next request clears the token (correct). The user re-authenticates, getting a new JWT with a new `iat`. The admin forces another password reset. On the user's next request, `clearAuthToken` runs, deleting `authenticatedAt`. The fallback to `iat` (which was set after the first invalidation) might make `isTokenInvalidated` return `false` for a brief window if `iat` > `tokenInvalidatedAt`. This would be a token revocation bypass.
- **Suggested fix:** Instead of falling back to `iat`, set `authenticatedAt` to `0` when clearing the token. This ensures `isTokenInvalidated` always returns `true` for a cleared token.

### CR10-SR2 — [MEDIUM] Metrics endpoint allows dual auth paths (session + CRON_SECRET) without rate limiting

- **Confidence:** MEDIUM
- **File:** `src/app/api/metrics/route.ts:23-48`
- **Evidence:** The GET `/api/metrics` endpoint has two auth paths: (1) session auth with `system.settings` capability, or (2) CRON_SECRET bearer token. Neither path is rate-limited. The CRON_SECRET path does not use `createApiHandler` and has no `consumeApiRateLimit` call. An attacker who obtains the CRON_SECRET could make unlimited requests to the metrics endpoint, potentially causing DB load from `getAdminHealthSnapshot`.
- **Failure scenario:** CRON_SECRET is leaked (e.g., committed to a public repo). An attacker makes thousands of requests per second to the metrics endpoint, each triggering a DB health snapshot query. This causes DB load spikes.
- **Suggested fix:** Wrap the CRON_SECRET path in a rate limiter, or migrate the endpoint to use `createApiHandler` with a custom auth check.

### CR10-SR3 — [LOW] Tags route now uses `createApiHandler` but does not specify `rateLimit` — carried forward

- **Confidence:** HIGH
- **File:** `src/app/api/v1/tags/route.ts:10-29`
- **Cross-agent agreement:** cycle-9 security-reviewer CR9-SR3
- **Evidence:** The tags route uses `createApiHandler` but does not pass a `rateLimit` key. Without rate limiting, an attacker could make unlimited requests to enumerate tags or cause DB load via the LIKE query.
- **Failure scenario:** Unauthenticated user (tags is auth-required by default) makes thousands of requests to the tags endpoint with different `q` parameters, each triggering a LIKE query on the `tags` table.
- **Suggested fix:** Add `rateLimit: "tags:read"` to the `createApiHandler` config.

### CR10-SR4 — [LOW] `validateShellCommand` denylist does not block `exec` and `source` shell builtins

- **Confidence:** LOW
- **Cross-agent agreement:** cycle-9 security-reviewer CR9-SR4
- **File:** `src/lib/compiler/execute.ts:156`
- **Evidence:** The regex denylist blocks backticks, `$(`, `${`, `<(`, `>()`, `||`, `|`, `>`, `<`, newlines, null, and `eval`. But `exec` and `source` are not blocked. While `validateShellCommandStrict` provides a secondary defense (checking command prefixes), adding `exec` and `source` to the denylist would be defense-in-depth.
- **Suggested fix:** Add `\bexec\b` and `\bsource\b` to the regex denylist.

### CR10-SR5 — [LOW] `decrypt()` plaintext fallback could mask migration failures in development

- **Confidence:** LOW
- **Cross-agent agreement:** cycle-9 security-reviewer CR9-SR5
- **File:** `src/lib/security/encryption.ts:78-81`
- **Evidence:** `decrypt()` returns values not starting with `enc:` as-is. In development, if `NODE_ENCRYPTION_KEY` is unset, the dev key is used. If a value was encrypted with a different dev key (e.g., after a restart with a new dev key), `decrypt()` would throw on `enc:`-prefixed values but silently return plaintext for others. This is by design but could mask configuration issues.
- **Suggested fix:** Add a development-mode warning when `decrypt()` receives a value that looks like it should be encrypted but the key has changed.

## Previously Found Issues (Still Open — Verified Present)

- D1: SSE submission events route capability check incomplete (MEDIUM)
- D3: JWT callback DB query on every request (MEDIUM)
- D5: Backup/restore/migrate routes use manual auth pattern (LOW)
- D6: Files/[id] DELETE/PATCH manual auth (LOW)
- D7: SSE re-auth rate limiting (LOW)

## Previously Found Issues (Verified Fixed Since Cycle 9)

- CR9-SR1: SSE re-auth fire-and-forget — FIXED (commit 908b12a1, now awaits re-auth check)
- CR9-V4: MySQL in validDialects — LOW, still present (intentionally deferred)
