# Security Reviewer — Cycle 3 Deep Review (2026-05-01)

**HEAD reviewed:** `894320ff` (main)

## Inventory of security-relevant files

- `src/lib/security/` (encryption, csrf, timing, password, rate-limit*, ip, sanitize-html, env, constants)
- `src/lib/auth/` (config, find-session-user, permissions, secure-cookie, session-security, trusted-host)
- `src/lib/judge/auth.ts` (judge auth, token hashing)
- `src/app/api/v1/judge/claim/route.ts` (claim endpoint auth)
- `src/app/api/v1/admin/backup/route.ts` (backup auth with password re-confirmation)
- `src/lib/compiler/execute.ts` (shell command validation)
- `judge-worker-rs/src/runner.rs` (Rust-side shell validation, constant-time auth)
- `src/lib/api/handler.ts` (API handler factory)

## Findings

### C3-SEC-1: `scoring.ts:78-99` — SQL column-name injection in `buildIoiLatePenaltyCaseExpr` (MEDIUM, confidence: High)

**File:** `src/lib/assignments/scoring.ts:78-99`

String-interpolated column names in raw SQL. Current callers pass safe string literals, but the function signature accepts arbitrary strings with no validation. This is a design-level SQL injection risk.

**Failure scenario:** A future caller passes user-influenced data as a column name parameter, enabling SQL injection.

**Fix:** Add a regex validation `^[a-zA-Z_][a-zA-Z0-9_.]*$` on all column name parameters, or use Drizzle column references.

### C3-SEC-2: `csrf.ts:56-58` — Origin check skipped when both `origin` and `sec-fetch-site` are absent (LOW, confidence: Medium)

**File:** `src/lib/security/csrf.ts:56-58`

When there is no `Origin` header AND no `Sec-Fetch-Site` header, the CSRF check passes if `expectedHost` is null (which it is in non-production when `AUTH_URL` is not configured). This means a cross-origin POST without Origin or Sec-Fetch-Site headers from a non-browser client would bypass the CSRF check entirely. However, the `X-Requested-With: XMLHttpRequest` check on line 40 still applies, so this is mitigated — HTML forms cannot set custom headers.

**Failure scenario:** A non-browser attacker (e.g., curl, Postman) can submit cross-origin requests without CSRF protection, but they must set the `X-Requested-With` header. Since this header is trivially spoofable by non-browser clients, the protection relies on browsers being the only CSRF vector.

**Fix:** This is an acceptable trade-off per the OWASP "custom header" CSRF mitigation pattern. Document the assumption that CSRF protection targets browser-based attacks only.

### C3-SEC-3: `compiler/execute.ts:162` — Shell command denylist regex may miss obfuscated patterns (LOW, confidence: Low)

**File:** `src/lib/compiler/execute.ts:162`

The regex `/`|\$\(|\$\{|[<>]\(|\|\||\||>|<|\n|\r|\beval\b|\bsource\b/` is the primary defense against command injection in admin-supplied compile/run commands. While the Docker sandbox is the primary boundary (as documented), the regex could be bypassed using Unicode normalization or multi-byte sequences. However, since commands come from admin-controlled DB rows (not user input), this is a very low risk.

**Failure scenario:** An admin with malicious intent crafts a command using Unicode escapes that bypass the regex but is interpreted by `sh -c`. The Docker sandbox prevents any real damage.

**Fix:** This is defense-in-depth; the Docker sandbox is the primary boundary. No action needed beyond documenting the trust boundary (already done).

### C3-SEC-4: `backup/route.ts:42-43` — No request body size limit for backup endpoint (LOW, confidence: Medium)

**File:** `src/app/api/v1/admin/backup/route.ts:42-43`

The backup route parses the request body with `request.json()` without any size limit. An attacker with admin credentials could send an extremely large JSON body, causing memory pressure. However, the `consumeApiRateLimit` check runs before body parsing, and the admin capability check also gates access.

**Failure scenario:** A compromised admin account sends a multi-GB JSON body to the backup endpoint, causing an OOM crash.

**Fix:** Add a body size check or use Next.js route config `export const maxDuration` / body size limits.

## Verified security controls

- **Encryption:** AES-256-GCM with proper IV, auth tag verification, key validation. Plaintext fallback is logged and gated by `NODE_ENV`. (C7-AGG-7 deferred, known.)
- **Timing-safe comparison:** `safeTokenCompare` correctly uses HMAC + `timingSafeEqual` to avoid length leakage.
- **Judge worker auth:** `isJudgeAuthorizedForWorker` validates against `secretTokenHash` with SHA-256 hashing, falls back to shared token only when worker not found.
- **IP allowlist:** `isJudgeIpAllowed` validates against CIDR ranges from env.
- **Rate limiting:** Three-module split (in-memory, api, login) all use DB server time for consistency.
- **CSRF:** `validateCsrf` checks `X-Requested-With`, `Sec-Fetch-Site`, and `Origin` headers.
- **HTML sanitization:** DOMPurify with strict allowlist, URI regex filter, link `rel` enforcement.
- **Shell command validation:** Denylist matches between TS and Rust implementations.

## Final sweep

All security modules reviewed. No HIGH-severity findings. No secrets in source. No hardcoded credentials. No `eval()` usage. `dangerouslySetInnerHTML` only used with `sanitizeHtml` (DOMPurify) and `safeJsonForScript` (JSON.stringify + HTML entity encoding).
