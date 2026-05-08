# Security Reviewer — Cycle 8 (Loop 8/100)

**Date:** 2026-04-24
**HEAD commit:** c5644a05

## Methodology

OWASP Top 10 focused review. Examined: authentication flows, session management, CSRF, rate limiting, encryption, input validation, output encoding, secrets handling, authorization checks, and data exposure paths.

## Findings

**No new security findings this cycle.** The codebase remains in a stable, mature security posture.

### Security Controls Verified (All Intact)

1. **Authentication**: Credentials provider with Argon2id hashing (bcrypt migration path with transparent rehashing). Dummy password hash for timing-safe user enumeration prevention. `safeTokenCompare` for constant-time token comparison.

2. **Session Security**: JWT strategy with `authenticatedAt` from DB server time. Token invalidation via `clearAuthToken` (sets `authenticatedAt=0` to force `isTokenInvalidated` true). `mustChangePassword` enforced at proxy and API levels.

3. **CSRF Protection**: Dual-layer — `X-Requested-With: XMLHttpRequest` header check + `Sec-Fetch-Site` + Origin validation. API key auth bypasses CSRF (correct — no cookies involved).

4. **Rate Limiting**: Three-tier — sidecar pre-check, PostgreSQL-backed with `SELECT FOR UPDATE`, in-memory for server actions. Exponential backoff on login failures. Per-IP and per-username keying.

5. **Encryption**: AES-256-GCM with `enc:` prefix for stored secrets. Plaintext fallback logs warning in production (cycle 7 fix). HKDF key derivation for domain separation. Legacy SHA-256 fallback for migration.

6. **Input Validation**: Zod schemas on all API routes via `createApiHandler`. Raw SQL queries use named parameters with strict identifier validation (`/^[a-zA-Z_]\w*$/`).

7. **HTML Sanitization**: DOMPurify with strict allow-lists. `safeJsonForScript` for JSON-LD (`</script` replacement). Markdown sanitized by stripping control characters.

8. **Output Encoding**: `redactSecret` fully redacts secrets. Submission visibility sanitization based on role/capabilities. `Cache-Control: no-store` on all authenticated API responses.

9. **Secrets Handling**: No passwords/secrets logged. API keys hashed with SHA-256 before storage. Recruiting tokens hashed before storage. Plaintext recruiting tokens NULLed in DB (cycle 7 fix).

10. **Proxy Security**: CSP with nonces, HSTS, `X-Forwarded-Host` deletion to prevent RSC corruption. Auth user cache with 2s TTL (negative results not cached). `Vary: Accept-Language, Cookie` headers.

### Carry-Over Deferred Items (Re-verified)

- AGG-2: `atomicConsumeRateLimit` uses `Date.now()` — LOW/MEDIUM
- SEC-2: Anti-cheat heartbeat dedup uses `Date.now()` for LRU cache — LOW/LOW
- SEC-3: Anti-cheat copies user text content — LOW/LOW
- SEC-4: Docker build error leaks paths — LOW/LOW

## Files Reviewed

`src/lib/auth/config.ts`, `src/lib/auth/session-security.ts`, `src/lib/auth/recruiting-token.ts`, `src/lib/security/api-rate-limit.ts`, `src/lib/security/csrf.ts`, `src/lib/security/encryption.ts`, `src/lib/security/password-hash.ts`, `src/lib/security/ip.ts`, `src/lib/security/timing.ts`, `src/lib/security/derive-key.ts`, `src/lib/security/sanitize-html.ts`, `src/lib/api/handler.ts`, `src/lib/api/auth.ts`, `src/lib/api/api-key-auth.ts`, `src/proxy.ts`, `src/lib/db/queries.ts`, `src/app/api/v1/admin/backup/route.ts`, `src/app/api/v1/admin/restore/route.ts`, `src/app/api/v1/admin/migrate/import/route.ts`, `src/components/seo/json-ld.tsx`, `src/lib/judge/auth.ts`
