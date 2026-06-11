# Security Reviewer — Cycle 28

**Date:** 2026-04-25
**Reviewer:** security-reviewer
**Scope:** Full repository security posture

## Review Inventory

Scanned for:
- OWASP Top 10 patterns across 567 TS/TSX files
- Secret exposure in logs, exports, API responses
- Authentication/authorization bypasses
- Injection vectors (SQL, command, path traversal, XSS)
- Cryptographic weaknesses
- Session management issues
- Rate limiting consistency
- Input validation gaps

## Findings

### SEC-1: [MEDIUM] `sessions.sessionToken` exposed in full-fidelity backup exports — not in `ALWAYS_REDACT`

**Confidence:** HIGH
**Citation:** `src/lib/db/export.ts:245-260`

Same finding as CR-1. The `sessions.sessionToken` column is in `SANITIZED_COLUMNS` but not `ALWAYS_REDACT`. Full-fidelity backup exports include session tokens in cleartext, enabling session hijacking if the backup file is compromised.

The codebase enforces a consistent "never log secrets" policy via `REDACT_PATHS` in `src/lib/logger.ts:19` (includes `sessionToken`). The `ALWAYS_REDACT` map exists to extend this policy to backup exports. The omission of `sessionToken` from `ALWAYS_REDACT` is inconsistent with the codebase's own secret-handling conventions.

**Severity rationale:** Session hijacking via leaked backup provides full authenticated access as any active user, including admins. Unlike password hash leaks (which require cracking), session tokens can be used directly with zero computational effort. The `ALWAYS_REDACT` map was specifically designed for this scenario — `passwordHash` and `encryptedKey` are already there.

**Concrete attack:** Admin downloads backup → stores on shared drive → low-privileged user reads `sessions.sessionToken` from JSON → sets `authjs.session-token` cookie → full admin access.

**Fix:** Add `sessions: new Set(["sessionToken"])` to `ALWAYS_REDACT`.

### SEC-2: [LOW] `accounts` OAuth tokens exposed in full-fidelity backup exports

**Confidence:** MEDIUM
**Citation:** `src/lib/db/export.ts:248, 256-260`

`accounts: ["refresh_token", "access_token", "id_token"]` is in `SANITIZED_COLUMNS` but not `ALWAYS_REDACT`. A compromised backup file would contain OAuth tokens that could be used to impersonate users on the OAuth provider.

The counter-argument is that full-fidelity backups need OAuth tokens for seamless restoration. This is a design trade-off.

**Fix:** Consider adding `accounts: new Set(["refresh_token", "access_token", "id_token"])` to `ALWAYS_REDACT`, or document the trade-off explicitly in the export module.

## Security Postive Observations

- No `eval()`, `new Function()`, or `innerHTML` assignments
- No `as any` type casts
- No SQL injection vectors (parameterized queries via Drizzle ORM and tagged template literals)
- No command injection vectors (all execFile/spawn use argument arrays)
- Path traversal protected in `resolveStoredPath()`
- ZIP bomb protection in `validateZipDecompressedSize()`
- AES-256-GCM encryption with proper auth tag handling and plaintext fallback protection
- Argon2id password hashing with OWASP-recommended parameters
- Transparent bcrypt-to-argon2id migration on successful login
- hCaptcha secret properly encrypted and redacted in exports and logs
- All clock-skew-sensitive comparisons use DB server time
- Rate limiting uses atomic DB transactions with `SELECT FOR UPDATE`
- CSRF protection properly skipped for API key auth
- Session invalidation on password change enforced at proxy level
- User-Agent binding (hash comparison) for session security
- Cookie security: `__Secure-` prefix used when appropriate
- `dangerouslySetInnerHTML` usage sanitized via DOMPurify
- File upload validation with MIME type and size checks
- Docker image reference validation via `isValidImageReference()`
- Dockerfile path traversal protection via regex check
