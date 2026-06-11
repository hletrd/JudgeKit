# Security Reviewer — Cycle 9 (Loop 9/100)

**Date:** 2026-04-24
**HEAD commit:** 524d59de

## Methodology

OWASP Top 10 focused review. Examined: authentication flows, session management, CSRF, rate limiting, encryption, input validation, output encoding, secrets handling, authorization checks, and data exposure paths. Verified fixes from prior loop's cycle 9.

## Findings

**No new security findings this cycle.**

### Verified Prior Fixes

- **CR9-SR1 (SSE re-auth race)**: Fixed — Re-auth now awaits before processing status events. Line 438 `return` prevents synchronous processing during re-auth.
- **CR9-SR3 (Tags route rate limiting)**: Fixed — Tags route now uses `createApiHandler` with `rateLimit: "tags:read"`.
- **F1 (json_extract)**: Fixed — No SQLite-specific functions remain in PostgreSQL paths.

### Security Controls Verified (All Intact)

1. **Authentication**: Argon2id hashing with timing-safe dummy hash, `safeTokenCompare` for constant-time comparison.
2. **Session Security**: JWT with DB-server-time `authenticatedAt`, `clearAuthToken` invalidation, `mustChangePassword` enforced.
3. **CSRF Protection**: Dual-layer — `X-Requested-With` + `Sec-Fetch-Site` + Origin validation.
4. **Rate Limiting**: Three-tier — sidecar, PostgreSQL-backed, in-memory. Tags route now covered.
5. **Encryption**: AES-256-GCM with `enc:` prefix, HKDF key derivation, plaintext fallback logs warning.
6. **Input Validation**: Zod schemas on all API routes, parameterized SQL queries, strict identifier validation.
7. **HTML Sanitization**: DOMPurify with strict allow-lists, `safeJsonForScript` for JSON-LD.
8. **Shell Command Validation**: Dual-layer denylist + prefix allow-list. `source` and `eval` in denylist. `exec` not in denylist but blocked by `validateShellCommandStrict` prefix check.
9. **Open Redirect Protection**: `getSafeRedirectUrl` validates same-origin path-absolute URLs only, handles all known bypass patterns.
10. **Backup/Restore**: Password re-confirmation, CSRF, rate-limiting, capability check, file size limits.

### Carry-Over Deferred Items (Re-verified)

- AGG-2: `atomicConsumeRateLimit` uses `Date.now()` — MEDIUM/MEDIUM
- SEC-2: Anti-cheat heartbeat dedup uses `Date.now()` for LRU cache — LOW/LOW
- SEC-3: Anti-cheat copies user text content — LOW/LOW
- SEC-4: Docker build error leaks paths — LOW/LOW

## Files Reviewed

All security-relevant source files under `src/`. Focus this cycle: `src/lib/auth/redirect.ts`, `src/lib/compiler/execute.ts:155-230`, `src/app/api/v1/tags/route.ts`, `src/app/api/v1/admin/backup/route.ts`, `src/app/api/v1/admin/restore/route.ts`, `src/app/api/v1/problems/import/route.ts`, `src/lib/assignments/access-codes.ts`
