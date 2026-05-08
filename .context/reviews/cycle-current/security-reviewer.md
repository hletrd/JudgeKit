# Security Review — Cycle 1/100

**Date:** 2026-05-08
**HEAD:** main / 5cec65e8
**Scope:** Full repository, all source files
**Reviewer:** security-reviewer (consolidated single-pass)

---

## Findings

### S1 — MEDIUM/HIGH — Production CSP allows `unsafe-inline` for scripts

- **File:** `next.config.ts:162`
- **Description:** The static CSP in next.config.ts includes `script-src 'self' 'unsafe-inline'` for production. The comment acknowledges this is because "Next.js config headers cannot contain dynamic nonces." However, Next.js 15+ supports `nonce` on the `<html>` tag (which the app already uses at `layout.tsx:100`), and the proxy middleware (`proxy.ts`) already generates nonces in development. The production CSP should be hardened to remove `unsafe-inline` and instead use the nonce-based approach already implemented in the dev proxy. The current production CSP allows any inline script, which defeats XSS protection.
- **Confidence:** HIGH
- **Suggested fix:** Reconcile the production CSP with the nonce-based dev CSP. Either run the proxy middleware in production (performance cost) or generate the CSP header dynamically in a custom server/Edge function with the nonce.

### S2 — MEDIUM — `sql.raw()` used with constant key in recruiting invitations, but pattern is risky

- **File:** `src/lib/assignments/recruiting-invitations.ts:97-126`
- **Description:** The `jsonb_set` SQL uses `sql.raw(FAILED_REDEEM_ATTEMPTS_KEY)` where `FAILED_REDEEM_ATTEMPTS_KEY` is presumably a constant string `"failedRedeemAttempts"`. While safe as a constant, the pattern of using `sql.raw()` for any key path is fragile — if this constant is ever made dynamic or derived from user input, it becomes an immediate SQL injection vector. The `sql.raw()` bypasses Drizzle's parameterization entirely.
- **Confidence:** HIGH
- **Suggested fix:** Add an explicit JSDoc warning on `FAILED_REDEEM_ATTEMPTS_KEY` declaring it must remain a compile-time constant. Consider using a stricter typed wrapper that rejects non-literal strings.

### S3 — MEDIUM — `escapeLikePattern` may not escape backslash correctly in all SQL contexts

- **File:** `src/app/(dashboard)/dashboard/admin/audit-logs/page.tsx:150`
- **Description:** The pattern `sql`${auditEvents.details} LIKE ${'"groupId":"' + escapeLikePattern(groupId) + '"%'} ESCAPE '\\'`" constructs a LIKE pattern via string concatenation inside a sql template literal. While `escapeLikePattern` handles `%` and `_`, the surrounding JSON structure `"groupId":"..."%` is concatenated directly. If `groupId` contains double-quote characters (unlikely but not impossible), the resulting SQL pattern becomes malformed. More importantly, this is a fragile pattern that mixes string concatenation with parameterized SQL.
- **Confidence:** MEDIUM
- **Suggested fix:** Use `jsonb_extract_path_text()` or a similar JSON-aware operator instead of LIKE-matching JSON strings.

### S4 — LOW — File upload storedName validation relies on nanoid() entropy

- **File:** `src/lib/files/storage.ts:18-27`
- **Description:** `resolveStoredPath` validates storedName against `/`, `\`, and `..` but does not check for null bytes, absolute paths, or symlink targets. Since `storedName` is generated via `nanoid()` in the upload handler, this is safe under normal operation. However, if a database administrator manually inserts a malicious `storedName` (e.g., `../../../etc/passwd`), the validation would reject `..` but might accept absolute paths like `/etc/passwd` on some platforms. Also, `lstat` in `execute.ts:663` checks for symlinks but the storage module does not.
- **Confidence:** LOW
- **Suggested fix:** Add validation for absolute paths and null bytes in `resolveStoredPath`. Add `lstat`+`isSymbolicLink` check before `writeFile`.

### S5 — LOW — `RUNNER_AUTH_TOKEN` empty string silently disables auth in non-production

- **File:** `src/lib/compiler/execute.ts:57-72`
- **Description:** When `COMPILER_RUNNER_URL` is set but `RUNNER_AUTH_TOKEN` is empty string `""`, the code logs a warning but still attempts unauthenticated requests. In production this throws, but in staging/pre-production environments with `NODE_ENV !== "production"`, this could expose the runner to unauthorized access. The `|| ""` fallback means `!RUNNER_AUTH_TOKEN` is true for both `undefined` and `""`.
- **Confidence:** MEDIUM
- **Suggested fix:** Treat empty string as an error in all environments when `COMPILER_RUNNER_URL` is set. Require explicit opt-in (e.g., `RUNNER_AUTH_TOKEN=none`) to disable auth.

### S6 — LOW — `isTrustedServerActionOrigin` bypasses origin check when trustedHosts is empty

- **File:** `src/lib/security/server-actions.ts:32-37`
- **Description:** When `TRUSTED_AUTH_HOSTS` is not configured and `NODE_ENV !== "production"`, the function returns `true` regardless of origin. This is documented but means any development/staging environment without explicit host configuration is vulnerable to CSRF via server actions. The development-mode bypass is overly broad.
- **Confidence:** MEDIUM
- **Suggested fix:** Require at least one trusted host to be configured before allowing any server action. The development bypass should only apply to localhost/127.0.0.1 origins, not any origin.

### S7 — LOW — `buildDockerImageLocal` uses repo root as build context

- **File:** `src/lib/docker/client.ts:203-277`
- **Description:** The Docker build command uses `.` (repo root) as the build context. While the Dockerfile path is validated to `docker/Dockerfile.judge-*`, the build context includes the entire repository, which could leak `.env` files, source code, or other sensitive files into the build if the Dockerfile has `COPY` instructions. The Rust worker counterpart should be checked for the same issue.
- **Confidence:** LOW
- **Suggested fix:** Use a restricted build context directory (e.g., `docker/build-context/`) containing only necessary files. Add `.dockerignore` to exclude sensitive files.

---

## Verified Safe Patterns

| Pattern | Location | Assessment |
|---|---|---|
| Argon2id with OWASP parameters | `src/lib/security/password-hash.ts` | Correct |
| Timing-safe token compare | `src/lib/security/timing.ts` | Correct |
| AES-256-GCM with auth tag | `src/lib/security/encryption.ts` | Correct |
| DB-backed rate limiting with FOR UPDATE | `src/lib/security/rate-limit.ts` | Correct |
| CSRF via X-Requested-With | `src/lib/security/csrf.ts` | Correct |
| Magic-byte file verification | `src/lib/files/validation.ts` | Correct |
| ZIP bomb protection | `src/lib/files/validation.ts` | Correct |
| DOMPurify with narrow allowlist | `src/lib/security/sanitize-html.ts` | Correct |
| Anti-cheat heartbeat correlation | `src/lib/assignments/submissions.ts:298-317` | Correct |
| API key role ceiling | `src/lib/api/api-key-auth.ts:115-119` | Correct |

---

## Security Verdict

No critical vulnerabilities found. The codebase has mature security practices with defense-in-depth. Production CSP hardening (S1) is the highest-priority security improvement.
