# Cycle 11 Security Reviewer Report

**Reviewer:** security-reviewer
**Date:** 2026-04-19
**Base commit:** 6c99b15c
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
- `src/lib/compiler/execute.ts` — Docker sandboxed execution
- `src/lib/realtime/realtime-coordination.ts` — SSE coordination
- `src/app/api/v1/submissions/[id]/events/route.ts` — SSE events route
- `src/app/api/v1/tags/route.ts` — Tags endpoint
- `src/app/api/metrics/route.ts` — Metrics endpoint
- `src/app/api/internal/cleanup/route.ts` — Cleanup cron endpoint
- `src/proxy.ts` — Edge middleware (auth cache, CSP, HSTS)
- `src/lib/plugins/secrets.ts` — Plugin secrets management

## Findings

### CR11-SR1 — [MEDIUM] Metrics endpoint allows dual auth paths (session + CRON_SECRET) without rate limiting

- **Confidence:** MEDIUM
- **File:** `src/app/api/metrics/route.ts:23-48`
- **Evidence:** The GET `/api/metrics` endpoint has two auth paths: (1) session auth with `system.settings` capability, or (2) CRON_SECRET bearer token. Neither path is rate-limited. The CRON_SECRET path does not use `createApiHandler` and has no `consumeApiRateLimit` call. An attacker who obtains the CRON_SECRET could make unlimited requests to the metrics endpoint, potentially causing DB load from `getAdminHealthSnapshot`.
- **Failure scenario:** CRON_SECRET is leaked. An attacker makes thousands of requests per second to the metrics endpoint, each triggering a DB health snapshot query. This causes DB load spikes.
- **Suggested fix:** Wrap the CRON_SECRET path in a rate limiter, or migrate the endpoint to use `createApiHandler` with a custom auth check.

### CR11-SR2 — [LOW] `AUTH_TOKEN_FIELDS` and `AUTH_PREFERENCE_FIELDS` are maintained independently — stale JWT fields after token revocation

- **Confidence:** HIGH
- **File:** `src/lib/auth/session-security.ts:42-63`, `src/lib/auth/config.ts:58-69`
- **Evidence:** When a new preference field is added to `AUTH_PREFERENCE_FIELDS` but not to `AUTH_TOKEN_FIELDS`, `clearAuthToken` would not clear it. The token would retain stale preference data after revocation. While the `jwt` callback re-syncs on the next request, the stale data is present in the token between revocation and re-sync.
- **Failure scenario:** New preference field `preferredEditorLayout` is added to `AUTH_PREFERENCE_FIELDS` but not `AUTH_TOKEN_FIELDS`. After admin forces password reset, `clearAuthToken` runs but `preferredEditorLayout` survives in the JWT. On next request, `jwt` callback re-queries and syncs — so the stale value is overwritten. Low probability of actual harm, but a maintenance hazard.
- **Suggested fix:** Derive the preference portion of `AUTH_TOKEN_FIELDS` from `AUTH_PREFERENCE_FIELDS` to ensure they stay in sync.

### CR11-SR3 — [LOW] Internal cleanup endpoint has no rate limiting

- **Confidence:** LOW
- **File:** `src/app/api/internal/cleanup/route.ts:7-25`
- **Evidence:** The POST `/api/internal/cleanup` endpoint validates CRON_SECRET but has no rate limiting. An attacker with a leaked CRON_SECRET could trigger cleanup repeatedly, causing DB write load. The endpoint calls `cleanupOldEvents()` which performs DELETE queries.
- **Failure scenario:** CRON_SECRET is leaked. Attacker triggers cleanup every second, causing unnecessary DELETE queries on the `auditEvents` and `loginEvents` tables.
- **Suggested fix:** Add a simple in-memory rate limiter (e.g., one cleanup per 60 seconds) or migrate to `createApiHandler` with rate limiting.

## Previously Found Issues (Still Open — Verified Present)

- D1: SSE submission events route capability check incomplete (MEDIUM)
- D3: JWT callback DB query on every request (MEDIUM)
- D5: Backup/restore/migrate routes use manual auth pattern (LOW)
- D6: Files/[id] DELETE/PATCH manual auth (LOW)
- D7: SSE re-auth rate limiting (LOW)

## Previously Found Issues (Verified Fixed Since Cycle 10)

- AGG-2 (CR10-SR1): `clearAuthToken` fallback to `iat` — FIXED (sets `authenticatedAt = 0`)
- AGG-7 (CR10-SR3): Tags route lacks rate limiting — FIXED
- AGG-8 (CR10-SR4): Shell command denylist missing `exec`/`source` — FIXED
