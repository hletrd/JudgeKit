# Security Review: API & Authentication

**Date**: 2026-04-17
**Reviewer**: Automated deep review
**Scope**: `src/app/api/`, `src/lib/auth/`, `src/lib/security/`

---

## CRITICAL

### S-01: Source Code Returned Without Authorization Check in Judge Claim

- **Severity**: CRITICAL
- **Category**: Data Exposure / Broken Access Control
- **Location**: `src/app/api/v1/judge/claim/route.ts:142,191`
- **Description**: The `/api/v1/judge/claim` endpoint returns `source_code` (full submission source) in the response. While the endpoint requires judge Bearer auth, the `JUDGE_AUTH_TOKEN` is shared across all workers and is a single static secret. Any process on any machine that knows this token can claim submissions and read all source code. There is no per-worker scoping — a compromised worker token gives access to every student's code.
- **Impact**: Full source code exfiltration for all submissions across all assignments.
- **Remediation**: 
  1. Rotate judge auth tokens per-worker (already partially supported via `workerSecret`).
  2. Enforce that claim responses are only sent over TLS (already enforced in production via nginx).
  3. Add IP allowlisting for judge endpoints in nginx config.
  4. Consider short-lived JWTs instead of a static shared secret.

### S-02: Named Parameter SQL Injection in rawQueryOne/rawQueryAll

- **Severity**: CRITICAL
- **Category**: SQL Injection
- **Location**: `src/lib/db/queries.ts:66-84`
- **Description**: The `namedToPositional()` function converts `@name` parameters to `$1` positional params. While this is parameterized and safe for the *values*, the function does NOT validate that all `@name` references in the SQL have corresponding entries in the `params` object. If a developer writes `@foo` in SQL but forgets to pass `foo` in params, it becomes `$N` with `undefined` as the value — which pg treats as SQL `NULL`. More critically, the SQL string itself is passed raw with no validation. If any caller constructs SQL by string concatenation before passing to `rawQueryOne`, injection is possible.
- **Impact**: Potential SQL injection if any raw query is constructed dynamically.
- **Remediation**:
  1. Add validation that every `@name` in the SQL has a corresponding key in `params`.
  2. Audit all 18 callers of `rawQueryOne`/`rawQueryAll` to confirm no string interpolation is used.
  3. Consider adding a lint rule forbidding template literals in the first argument.

### S-03: Timing Side-Channel in safeTokenCompare Leaks Token Length

- **Severity**: CRITICAL
- **Category**: Timing Attack
- **Location**: `src/lib/security/timing.ts:12`
- **Description**: `safeTokenCompare()` checks `provided.length !== expected.length` and returns `false` immediately before the HMAC comparison. This leaks the expected token's length via response timing — an attacker can determine the exact length of the judge auth token by measuring response times for different-length inputs. Combined with the fact that `JUDGE_AUTH_TOKEN` is a hex string of known length (64 chars for `openssl rand -hex 32`), this check actually confirms to attackers they have the right length.
- **Impact**: Token length leakage reduces brute-force search space for the judge auth token.
- **Remediation**: Remove the early length check. The HMAC-based comparison with `timingSafeEqual` already handles different-length inputs safely (both get HMAC'd to the same fixed 32-byte digest). The length check comment says "Token length is not secret information" but for auth tokens it absolutely is:
  ```typescript
  export function safeTokenCompare(provided: string, expected: string): boolean {
    const key = randomBytes(32);
    const a = createHmac("sha256", key).update(provided).digest();
    const b = createHmac("sha256", key).update(expected).digest();
    return timingSafeEqual(a, b);
  }
  ```

---

## HIGH

### S-04: JsonLd Component Uses dangerouslySetInnerHTML with JSON.stringify

- **Severity**: HIGH
- **Category**: XSS
- **Location**: `src/components/seo/json-ld.tsx:9`
- **Description**: `dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}` is used for structured data. While `JSON.stringify` escapes `</script>` as `<\/script>`, it does NOT escape other HTML entities. If `data` contains user-controlled strings with `</script>` or other HTML-breaking sequences in older browsers, XSS is possible. More importantly, if any value in `data` contains `</script><script>alert(1)</script>`, some older browsers may execute it.
- **Impact**: Potential XSS via structured data containing user-controlled content.
- **Remediation**: Sanitize the JSON output to escape `</script>` sequences:
  ```typescript
  const safeJson = JSON.stringify(data).replace(/<\/script/gi, '<\\/script');
  dangerouslySetInnerHTML={{ __html: safeJson }}
  ```

### S-05: Docker Build Path Validation Bypass

- **Severity**: HIGH
- **Category**: Path Traversal
- **Location**: `src/lib/docker/client.ts:130`
- **Description**: The `buildDockerImageLocal()` function validates `dockerfilePath` with `/\.\.|[/\\]/.test(dockerfilePath.replace(/^docker\/Dockerfile\./, ""))`. This strips the prefix `docker/Dockerfile.` before checking for `..` and slashes. However, a path like `docker/Dockerfile.judge-python/../../etc/passwd` would pass the check because after removing the prefix, `judge-python/../../etc/passwd` contains `..` which IS caught. BUT the regex only checks after the prefix removal, and the replacement is not anchored — a path like `foo/docker/Dockerfile.judge-x` would have only `x` checked. The function also runs `docker build -f dockerfilePath .` which uses the path as-is relative to CWD. If an admin-controlled `dockerfilePath` contains a valid-looking but malicious path, Docker will follow it.
- **Impact**: Admin can potentially read arbitrary files on the host via Docker build context (requires admin role).
- **Remediation**: Use a stricter validation:
  ```typescript
  if (!/^docker\/Dockerfile\.judge-[a-z0-9-]+$/.test(dockerfilePath)) {
    return { success: false, error: "Invalid dockerfile path" };
  }
  ```

### S-06: Password Policy Too Weak

- **Severity**: HIGH
- **Category**: Weak Authentication
- **Location**: `src/lib/security/password.ts:1-14`
- **Description**: Password validation only checks minimum length (8 characters). There is no check for: common passwords, character diversity, username similarity, or repeated characters. The `_context` parameter (containing username and email) is accepted but completely ignored. This means passwords like `aaaaaaaa`, `12345678`, or the user's own username are accepted.
- **Impact**: Weak passwords lead to account compromise, especially given that login rate limiting allows 10 attempts per window.
- **Remediation**:
  1. Implement the `_context` parameter to reject passwords matching username/email.
  2. Add a minimum character class check (at least 2 of: uppercase, lowercase, digit, special).
  3. Consider checking against a list of top-10K common passwords.

### S-07: Judge Token Exposed in Docker Run Command Logs

- **Severity**: HIGH
- **Category**: Secret Exposure in Logs
- **Location**: `src/lib/compiler/execute.ts:57,396`
- **Description**: `JUDGE_AUTH_TOKEN` is read from `process.env.JUDGE_AUTH_TOKEN` at module level and used in the `Authorization: Bearer` header when calling the Rust runner. While the token itself isn't logged directly, the full Docker run command IS logged (`logger.info({ container: containerName, command: args.join(" ") })` at line 263). If any env var leaks into container args, it would appear in logs. More critically, the `COMPILER_RUNNER_URL` and the fact that auth is Bearer-based are visible in error messages.
- **Impact**: Potential token exposure through log aggregation systems.
- **Remediation**: Ensure the auth token is never included in any log output. Add a log sanitization step that redacts `Authorization` headers.

---

## MEDIUM

### S-08: CSRF Bypass via Missing Origin Header

- **Severity**: MEDIUM
- **Category**: CSRF
- **Location**: `src/lib/security/csrf.ts:55-63`
- **Description**: The CSRF check only validates the `Origin` header if it is present AND `expectedHost` is available. If an attacker sends a cross-origin request without an `Origin` header (possible with some redirect chains or older browsers), the origin check is skipped entirely. The check relies on `X-Requested-With: XMLHttpRequest` as the primary defense, which is effective against HTML form submissions but can be bypassed by plugins/extensions that add custom headers.
- **Impact**: CSRF protection may be bypassed in specific scenarios.
- **Remediation**: Make the `Origin` check mandatory for all non-GET requests when `expectedHost` is available. If `Origin` is absent and `Sec-Fetch-Site` is also absent, reject the request.

### S-09: Rate Limit Key Based on IP Can Be Bypassed

- **Severity**: MEDIUM
- **Category**: Rate Limit Bypass
- **Location**: `src/lib/security/rate-limit.ts:26-28`
- **Description**: Rate limit keys are derived from `extractClientIp(headers)`, which reads from `X-Forwarded-For`. An attacker behind a botnet or rotating proxy can bypass IP-based rate limits entirely. The `consumeUserApiRateLimit()` function exists for user-scoped limits but is not used consistently across all mutation endpoints.
- **Impact**: Rate limiting can be bypassed by rotating IPs.
- **Remediation**: Apply both IP-based AND user-based rate limits on all sensitive mutation endpoints (login, submission, file upload). Prioritize user-scoped limits for authenticated endpoints.

### S-10: Session Cookie SameSite=Lax Allows CSRF on Safe-ish Methods

- **Severity**: MEDIUM
- **Category**: CSRF
- **Location**: `src/lib/auth/config.ts:127`
- **Description**: Session cookies are set with `sameSite: "lax"`, which allows cookies to be sent on top-level navigations from external sites. While this prevents POST-based CSRF, it allows GET requests with session cookies from external origins. If any GET endpoint performs state-changing operations (a common anti-pattern), it would be vulnerable.
- **Impact**: Potential CSRF via GET requests if any GET handler modifies state.
- **Remediation**: Audit all GET handlers to confirm none perform state-changing operations. Consider `sameSite: "strict"` for high-security deployments.

### S-11: JWT Token Contains Too Much Data

- **Severity**: MEDIUM
- **Category**: Information Exposure
- **Location**: `src/lib/auth/config.ts:87-113`
- **Description**: The JWT token stores 17+ user fields including `email`, `className`, `editorFontFamily`, `lectureColorScheme`, etc. Every API request sends this entire token. The token is stored in a cookie, so this data is sent on every request including static assets. This bloats request sizes and exposes user preferences in the JWT payload (which is base64, not encrypted).
- **Impact**: Increased bandwidth usage and minor information exposure in JWT payload.
- **Remediation**: Store only essential fields (`sub`, `role`, `authenticatedAt`) in the JWT. Fetch other user preferences from the DB on demand or cache them server-side.

---

## LOW

### S-12: Eviction Timer Leaks on Hot Reload

- **Severity**: LOW
- **Category**: Resource Leak
- **Location**: `src/lib/security/rate-limit.ts:46-53`
- **Description**: `startRateLimitEviction()` creates a `setInterval` timer but `stopRateLimitEviction()` is never called during Next.js hot module reloading. In development, this can create multiple concurrent eviction timers.
- **Impact**: Multiple eviction timers in development mode.
- **Remediation**: Call `stopRateLimitEviction()` before starting a new one, or use a singleton pattern.

### S-13: `as any` Casts in Schema Files

- **Severity**: LOW
- **Category**: Type Safety
- **Location**: `src/lib/db/migrate.ts`, `src/lib/db/export.ts`, `src/lib/assignments/management.ts`
- **Description**: Three files use `as any` casts, which bypass TypeScript's type checking. These are in database schema migration and export code where type mismatches could lead to silent data corruption.
- **Impact**: Potential runtime errors from type mismatches.
- **Remediation**: Replace `as any` with proper type assertions or generics.
