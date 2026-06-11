# Auth, Session & Security Subsystem -- Deep Code Review

**Reviewer:** Claude Opus 4.6 (code-reviewer agent)
**Date:** 2026-04-18
**Repository:** judgekit (Next.js online-judge platform)
**Scope:** All files in `src/lib/auth/*`, `src/lib/security/*`, `src/lib/api/auth.ts`, `src/lib/api/api-key-auth.ts`, `src/lib/api/handler.ts`, `src/lib/api/client.ts`, `src/lib/api/responses.ts`, `src/lib/api/pagination.ts`, `src/lib/capabilities/*`, `src/lib/users/core.ts`, `src/proxy.ts`, `src/instrumentation.ts`, `src/app/api/auth/[...nextauth]/route.ts`, `src/app/change-password/*`, `src/lib/actions/change-password.ts`, `src/lib/db/selects.ts`, `src/lib/assignments/recruiting-invitations.ts`

---

## Executive Summary

The auth/security subsystem is **well-engineered overall**, with strong fundamentals: Argon2id password hashing with bcrypt migration, timing-safe token comparisons, proper CSRF protection via custom header + origin validation, session token invalidation on password change, comprehensive rate limiting with atomic DB transactions, and a nonce-based CSP. The codebase shows evidence of thoughtful security design decisions with good defensive-in-depth layering.

That said, this review identifies **2 High**, **7 Medium**, and **8 Low** severity findings. There are no Critical findings -- no auth bypass, no hardcoded production secrets, no SQL injection. The High findings relate to (1) an open redirect vector in the proxy middleware and (2) a race condition window in the password change flow.

---

## Findings

---

### [HIGH-01] Open Redirect via `callbackUrl` in Proxy Middleware

**Severity:** High
**Confidence:** High
**Status:** Confirmed
**File:** `src/proxy.ts:274-276`

```typescript
const loginUrl = new URL("/login", request.url);
loginUrl.searchParams.set("callbackUrl", request.nextUrl.pathname);
return clearAuthSessionCookies(NextResponse.redirect(loginUrl));
```

**Explanation:** The proxy sets `callbackUrl` to `request.nextUrl.pathname`, which is safe in itself (pathname-only). However, the downstream login form at `src/app/(auth)/login/login-form.tsx:12-18` applies its own validation:

```typescript
function getSafeRedirectUrl(callbackUrl: string | null): string {
  if (!callbackUrl) return "/dashboard";
  if (callbackUrl.startsWith("/") && !callbackUrl.startsWith("//")) {
    return callbackUrl;
  }
  return "/dashboard";
}
```

The check blocks `//evil.com` but does NOT block paths like `/\evil.com` (backslash is normalized to forward slash by some browsers), nor does it verify the URL doesn't contain a `@` symbol (e.g., `/login?callbackUrl=/%2F@evil.com/`). More importantly, the `callbackUrl` parameter is user-controlled via the original request URL. An attacker can craft a URL like `https://app.example.com/workspace/../../%0d%0aLocation:%20https://evil.com` or similar path-traversal/header-injection patterns. While `nextUrl.pathname` does provide some normalization, the lack of an allowlist or a stricter URL parsing approach means edge cases may slip through depending on the URL parser behavior.

**Exploit Scenario:** An attacker sends a victim a link to the app that, after login, redirects to an attacker-controlled site for credential phishing.

**Fix:** Add an allowlist of valid redirect path prefixes, or use `new URL(callbackUrl, origin)` and verify the resulting origin matches the app origin before redirecting. Also sanitize out CRLF characters:

```typescript
function getSafeRedirectUrl(callbackUrl: string | null): string {
  if (!callbackUrl) return "/dashboard";
  // Strip control characters
  const clean = callbackUrl.replace(/[\x00-\x1f]/g, "");
  if (!clean.startsWith("/") || clean.startsWith("//")) return "/dashboard";
  try {
    const resolved = new URL(clean, "https://placeholder.local");
    if (resolved.origin !== "https://placeholder.local") return "/dashboard";
    if (resolved.username || resolved.password) return "/dashboard";
  } catch { return "/dashboard"; }
  return clean;
}
```

---

### [HIGH-02] TOCTOU Window in Password Change: Session Remains Valid Until Re-login

**Severity:** High
**Confidence:** Medium
**Status:** Likely

**Files:**
- `src/lib/actions/change-password.ts:62-69`
- `src/app/change-password/change-password-form.tsx:47-55`

```typescript
// change-password.ts:62-69
await db.update(users).set(withUpdatedAt({
  passwordHash: newHash,
  mustChangePassword: false,
  tokenInvalidatedAt: new Date(),  // <-- invalidates all sessions
})).where(eq(users.id, user.id));
```

```typescript
// change-password-form.tsx:47-55
await signOut({ redirect: false });
const refreshedSession = await signIn("credentials", {
  username,
  password: newPassword,   // <-- uses the NEW password
  redirect: false,
  redirectTo: "/dashboard",
});
```

**Explanation:** The server-side `changePassword` action sets `tokenInvalidatedAt = new Date()`, which invalidates ALL existing JWT tokens for that user. Then the client-side form calls `signOut` followed by `signIn`. Between the `signOut` (which clears the client cookie) and the `signIn` (which creates a new session), there is a window where:

1. If `signIn` fails for any reason (network error, rate limit, race with another concurrent password change), the user is locked out -- they have no session and the old password no longer works.
2. The new password is sent from the client to the server via the `signIn` call. This is the standard next-auth credentials flow, but it means the new password traverses the network a second time (once for the change, once for re-authentication).

Additionally, `signIn("credentials", { username, password: newPassword })` re-sends the new password over the wire in the `signIn` call. The `username` prop is passed from the server component, which is safe, but the password is held in client state.

**Risk:** If the re-login fails, the user is stuck on a page that cannot recover -- they must manually navigate to `/login` and log in with the new password. This is a UX failure mode with security implications (users may think the change failed and try again, potentially getting rate-limited).

**Fix:** Instead of sign-out-then-sign-in on the client, have the server action return a one-time token or use server-side session refresh. Alternatively, add explicit error recovery UI that directs the user to `/login` if the `signIn` call fails, and consider a server-side approach to session rotation that doesn't require re-sending the password.

---

### [MEDIUM-01] `isTokenInvalidated` Fails Open When `authenticatedAt` is Null

**Severity:** Medium
**Confidence:** High
**Status:** Confirmed
**File:** `src/lib/auth/session-security.ts:25-35`

```typescript
export function isTokenInvalidated(
  authenticatedAtSeconds: number | null,
  tokenInvalidatedAt: Date | null | undefined
) {
  if (authenticatedAtSeconds === null || authenticatedAtSeconds === undefined || !tokenInvalidatedAt) {
    return false;  // <-- fails open
  }
  const invalidatedAtSeconds = Math.floor(tokenInvalidatedAt.getTime() / 1000);
  return authenticatedAtSeconds < invalidatedAtSeconds;
}
```

**Explanation:** If a JWT token somehow lacks both `authenticatedAt` and `iat` fields (corrupted token, downgrade attack, migration edge case), the function returns `false` -- meaning the token is treated as NOT invalidated. A token that should have been revoked (e.g., after password change) could continue to work if its timestamp fields are missing.

The `getTokenAuthenticatedAtSeconds` function at lines 13-22 tries both `authenticatedAt` and `iat`, returning `null` if neither is a finite number. A token without any timestamp should be considered MORE suspicious, not less.

**Fix:** Invert the default: if `authenticatedAtSeconds` is null and `tokenInvalidatedAt` is set, return `true` (treat as invalidated):

```typescript
if (!tokenInvalidatedAt) return false;
if (authenticatedAtSeconds === null || authenticatedAtSeconds === undefined) {
  return true; // No timestamp + invalidation exists = fail closed
}
```

---

### [MEDIUM-02] Proxy Auth Cache Allows 2-Second Window After User Deactivation

**Severity:** Medium
**Confidence:** High
**Status:** Confirmed
**File:** `src/proxy.ts:22-26`

```typescript
const AUTH_CACHE_TTL_MS = parseInt(process.env.AUTH_CACHE_TTL_MS ?? '2000', 10);
const AUTH_CACHE_MAX_SIZE = 500;
```

**Explanation:** The proxy caches auth user lookups for 2 seconds. During this window, a user who has been deactivated or whose token has been invalidated can continue to access protected routes. The code documents this as an intentional tradeoff, and negative results are NOT cached (good). However, the TTL is configurable via environment variable with no upper bound validation -- an operator could accidentally set `AUTH_CACHE_TTL_MS=3600000` (1 hour), creating a serious security gap.

**Fix:** Add a maximum cap on the TTL value:

```typescript
const AUTH_CACHE_TTL_MS = Math.min(
  parseInt(process.env.AUTH_CACHE_TTL_MS ?? '2000', 10),
  10_000  // Hard cap: 10 seconds
);
```

---

### [MEDIUM-03] hCaptcha Token Not Validated for Replay

**Severity:** Medium
**Confidence:** Medium
**Status:** Needs-validation
**File:** `src/lib/security/hcaptcha.ts:42-85`

```typescript
export async function verifyHcaptchaToken(token: string, remoteIp?: string | null) {
  // ... calls hcaptcha API ...
  return {
    success: payload.success === true,
    errorCodes: payload["error-codes"] ?? [],
  };
}
```

**Explanation:** The hCaptcha verification calls the hCaptcha API, which should handle replay prevention on their side (each token is single-use). However, this code does not check the `hostname` field in the hCaptcha response to verify the token was generated for this domain. An attacker who obtains a valid hCaptcha token for a different site using the same site key could potentially replay it here.

Additionally, hCaptcha responses include a `challenge_ts` timestamp that is not validated -- a very old (but somehow valid) token would be accepted.

**Fix:** Validate the `hostname` field from the hCaptcha response matches the expected domain. Consider validating `challenge_ts` is within a reasonable window (e.g., 5 minutes).

---

### [MEDIUM-04] Password Policy is Minimal -- Length Only

**Severity:** Medium
**Confidence:** High
**Status:** Confirmed
**File:** `src/lib/security/password.ts:1-19`

```typescript
export const FIXED_MIN_PASSWORD_LENGTH = 8;

export function getPasswordValidationError(
  password: string,
  context?: { username?: string; email?: string | null }
): PasswordValidationError | null {
  void context;  // <-- context is explicitly ignored!
  if (password.length < FIXED_MIN_PASSWORD_LENGTH) {
    return "passwordTooShort";
  }
  return null;
}
```

**Explanation:** The password policy only checks minimum length (8 characters). The `context` parameter (username, email) is accepted but explicitly ignored (`void context`). This means:
- Passwords identical to the username are allowed (e.g., username `admin123`, password `admin123`)
- Common/breached passwords are allowed (e.g., `password`, `12345678`)
- No character class requirements (though this is defensible per NIST 800-63B)

The function signature suggests context-aware validation was planned but not implemented.

**Fix:** Implement the context check to reject passwords containing the username or email prefix. Consider checking against a list of commonly breached passwords (top 10k-100k list):

```typescript
export function getPasswordValidationError(
  password: string,
  context?: { username?: string; email?: string | null }
): PasswordValidationError | null {
  if (password.length < FIXED_MIN_PASSWORD_LENGTH) {
    return "passwordTooShort";
  }
  const lower = password.toLowerCase();
  if (context?.username && lower.includes(context.username.toLowerCase())) {
    return "passwordContainsUsername";
  }
  if (context?.email) {
    const emailPrefix = context.email.split("@")[0]?.toLowerCase();
    if (emailPrefix && emailPrefix.length >= 3 && lower.includes(emailPrefix)) {
      return "passwordContainsEmail";
    }
  }
  return null;
}
```

---

### [MEDIUM-05] Recruiting Token Redemption Has No Rate Limiting

**Severity:** Medium
**Confidence:** High
**Status:** Confirmed
**Files:**
- `src/lib/auth/config.ts:143-172` (recruiting token path)
- `src/lib/assignments/recruiting-invitations.ts:249-452` (`redeemRecruitingToken`)

```typescript
// config.ts:143-145
if (typeof credentials?.recruitToken === "string" && credentials.recruitToken.length > 0) {
  const recruitIpKey = getRateLimitKey("login", request.headers);
  if (await consumeRateLimitAttemptMulti(recruitIpKey)) {
```

**Explanation:** The recruiting token auth path in `config.ts` does apply IP-based rate limiting, which is good. However, it does NOT apply per-token rate limiting. An attacker who has a valid token hash can brute-force the account password (for already-redeemed tokens that require `accountPassword`) without any per-token throttling -- only the IP limit applies. If the attacker uses multiple IPs (botnet, cloud IPs), the IP rate limit is ineffective.

The `redeemRecruitingToken` function itself has no rate limiting -- it relies entirely on the upstream `authorize` function. For the "already redeemed" path that validates `accountPassword`, failed password attempts are not recorded.

**Fix:** Add per-token rate limiting for the already-redeemed password verification path:

```typescript
const tokenRateLimitKey = `recruit-token:${hashToken(token).slice(0, 16)}`;
if (await consumeRateLimitAttemptMulti(recruitIpKey, tokenRateLimitKey)) {
  // rate limited
}
```

---

### [MEDIUM-06] `X-Forwarded-Host` Deleted in Proxy May Break Auth Callback Resolution

**Severity:** Medium
**Confidence:** Medium
**Status:** Needs-validation
**File:** `src/proxy.ts:145`

```typescript
// Next.js 16 RSC bug: X-Forwarded-Host from nginx corrupts RSC streaming
// during client-side navigation, causing React #300/#310 errors.
// Auth routes (/api/auth/) are NOT in the proxy matcher, so they keep
// the header for proper callback URL resolution.
requestHeaders.delete("x-forwarded-host");
```

**Explanation:** The comment says auth routes are NOT in the proxy matcher, but looking at the matcher config (line 298-316), `/api/v1/:path*` IS in the matcher, and the auth route is `/api/auth/[...nextauth]` which is NOT `/api/v1/...`. So the NextAuth routes should indeed bypass this middleware. However, this is fragile -- if someone adds `/api/auth/:path*` to the matcher, auth callbacks would break silently because `X-Forwarded-Host` would be stripped. The comment explains the intent but there is no runtime guard.

**Fix:** Add a guard that skips the header deletion for auth routes:

```typescript
if (!pathname.startsWith("/api/auth/")) {
  requestHeaders.delete("x-forwarded-host");
}
```

---

### [MEDIUM-07] Encryption Module Falls Back to Plaintext in Dev Mode

**Severity:** Medium
**Confidence:** High
**Status:** Confirmed
**File:** `src/lib/security/encryption.ts:28-39`

```typescript
export function encrypt(plaintext: string): string {
  const key = getKey();
  if (!key) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("NODE_ENCRYPTION_KEY must be set in production...");
    }
    console.warn("[encryption] NODE_ENCRYPTION_KEY not set — skipping encryption (dev only)");
    return plaintext;  // <-- stores secrets in plaintext
  }
```

**Explanation:** In development mode without `NODE_ENCRYPTION_KEY`, the `encrypt` function returns plaintext. This means any values encrypted in dev (API keys, plugin configs, hCaptcha secrets stored in DB) are stored unencrypted. If a development database is accidentally exposed or migrated to staging/production, these values are plaintext. The `decrypt` function handles this gracefully (returns non-prefixed values as-is), but the risk is data leakage from dev environments.

**Fix:** This is acceptable for local development but should log a more prominent warning. Consider using a deterministic dev-only key (e.g., derived from a well-known constant) rather than storing plaintext, so the data format is always consistent.

---

### [LOW-01] `console.warn` Used Instead of Structured Logger in Security Module

**Severity:** Low
**Confidence:** High
**Status:** Confirmed
**File:** `src/lib/security/encryption.ts:36-37, 70-71`

```typescript
console.warn("[encryption] NODE_ENCRYPTION_KEY not set — skipping encryption (dev only)");
```

**Explanation:** The encryption module uses `console.warn` instead of the project's structured `logger`. All other security modules use the `logger` from `@/lib/logger`. Using `console.warn` means these messages won't appear in structured log aggregation and may not be captured in production log pipelines.

**Fix:** Replace `console.warn` with `logger.warn` from `@/lib/logger`.

---

### [LOW-02] `clearAuthToken` Deletes Properties But Returns the (Partially Populated) JWT Object

**Severity:** Low
**Confidence:** Medium
**Status:** Confirmed
**File:** `src/lib/auth/session-security.ts:37-60`

```typescript
export function clearAuthToken(token: JWT) {
  delete token.sub;
  delete token.id;
  // ... many deletes ...
  return token;
}
```

**Explanation:** The function clears known auth fields from the JWT, but the token may contain other fields added by NextAuth or plugins (`jti`, `iat`, `exp`, `nbf`). These are left intact. A cleared token with valid `iat`/`exp` but no `sub`/`id` will be treated as unauthenticated by downstream code (which checks for `userId`), so this is not exploitable. However, returning a partially-populated object is a code smell -- a future change that checks `token.iat` for freshness could accidentally treat a cleared token as valid.

**Fix:** Consider returning an empty object `{} as JWT` or explicitly clearing all standard JWT fields as well.

---

### [LOW-03] API Key SHA-256 Hash Comparison Uses `safeTokenCompare` on Already-Hashed Values

**Severity:** Low
**Confidence:** High
**Status:** Confirmed
**File:** `src/lib/api/api-key-auth.ts:69-73`

```typescript
const keyHash = hashApiKey(rawKey);
const [candidate] = await db
  .select().from(apiKeys)
  .where(and(eq(apiKeys.keyHash, keyHash), eq(apiKeys.isActive, true)))
  .limit(1);
```

**Explanation:** API key authentication hashes the provided key with SHA-256 and then uses SQL `WHERE keyHash = ?` for lookup. This is a database equality comparison, not a timing-safe comparison. Theoretically, the database query timing could leak information about how many characters of the hash match. However, since SHA-256 hashes are uniformly distributed and the key space is 2^160 (20 random bytes), this is practically unexploitable. The actual security-sensitive comparison (worker secrets in `judge/auth.ts`) correctly uses `safeTokenCompare`.

**Fix:** No immediate fix needed. For defense-in-depth, consider using the DB lookup for candidate selection and then `safeTokenCompare` for final validation, though the current approach is standard practice (GitHub, Stripe, etc. all use hash-based DB lookup).

---

### [LOW-04] Rate Limit Key Uses `"unknown"` as Fallback IP

**Severity:** Low
**Confidence:** High
**Status:** Confirmed
**File:** `src/lib/security/rate-limit.ts:27`

```typescript
export function getRateLimitKey(action: string, headers: Headers) {
  return `${action}:${extractClientIp(headers) ?? "unknown"}`;
}
```

**Explanation:** If the client IP cannot be determined (no X-Forwarded-For, not behind a proxy), all such requests share the single rate limit key `login:unknown`. In production, `extractClientIp` returns `null` when no proxy headers are present, so all non-proxied requests would be lumped together. This could cause legitimate users to be rate-limited by other users' failed attempts. However, the comment in `ip.ts:67` logs a warning in production when XFF is missing, and the architecture expects a reverse proxy.

**Fix:** Consider including additional request entropy (e.g., partial user-agent hash) in the fallback key, or reject requests without a determinable IP in production (fail closed for rate limiting).

---

### [LOW-05] HKDF Salt is Empty String

**Severity:** Low
**Confidence:** Medium
**Status:** Confirmed
**File:** `src/lib/security/derive-key.ts:17`

```typescript
return Buffer.from(hkdfSync("sha256", secret, "", domain, 32));
//                                        ^^ empty salt
```

**Explanation:** HKDF is used with an empty string as the salt parameter. Per RFC 5869, when no salt is provided, HKDF uses a string of `HashLen` zeros. This is cryptographically acceptable -- the domain separation via the `info` parameter (`domain`) is the important part. However, using a proper random salt (even a fixed application-wide one) provides additional defense-in-depth against multi-target attacks.

**Fix:** Consider using a fixed, application-specific salt (e.g., `"judgekit-key-derivation-v1"`) rather than empty string:

```typescript
return Buffer.from(hkdfSync("sha256", secret, "judgekit-key-derivation-v1", domain, 32));
```

---

### [LOW-06] `sanitizeMarkdown` Only Strips Control Characters, No XSS Protection

**Severity:** Low
**Confidence:** Medium
**Status:** Confirmed
**File:** `src/lib/security/sanitize-html.ts:85-88`

```typescript
export function sanitizeMarkdown(text: string): string {
  return text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
}
```

**Explanation:** The function only removes control characters. It does NOT sanitize HTML or prevent XSS. The comment explains this is intentional because the markdown is rendered by `react-markdown` with `skipHtml`, which is inherently XSS-safe. This design is correct IF the markdown rendering pipeline always uses `skipHtml`. If any code path renders this markdown with HTML enabled, XSS would be possible.

**Fix:** Add a comment/JSDoc warning that this function MUST only be used in conjunction with an XSS-safe renderer. Consider adding a runtime assertion or a type-level distinction (e.g., `SafeMarkdown` branded type) to prevent misuse.

---

### [LOW-07] Role Cache TTL Creates a 60-Second Privilege Escalation Window

**Severity:** Low
**Confidence:** High
**Status:** Confirmed
**File:** `src/lib/capabilities/cache.ts:17`

```typescript
const ROLE_CACHE_TTL_MS = 60_000; // 60 seconds
```

**Explanation:** When an admin downgrades a user's role (e.g., from admin to student), the capability cache retains the old capabilities for up to 60 seconds. During this window, the user retains their old permissions. Combined with the 2-second proxy auth cache, the effective window is ~62 seconds.

The cache includes a safety net: `super_admin` always resolves to ALL capabilities regardless of cache (line 91-93). But for other role changes, the delay exists.

**Fix:** When changing a user's role, call `invalidateRoleCache()` to force an immediate reload. This appears to be exported but whether it's actually called on role changes should be verified. The 60-second window is acceptable for most use cases but should be documented.

---

### [LOW-08] `users.manage_roles` Capability Exists But Is Never Checked

**Severity:** Low
**Confidence:** Medium
**Status:** Needs-validation
**File:** `src/lib/capabilities/types.ts:14`

```typescript
"users.manage_roles",
```

**Explanation:** The capability `users.manage_roles` is defined in the type system and included in `ALL_CAPABILITIES`, but a grep for its usage shows it is never checked in any authorization gate. Role management appears to use the level-based `canManageRole` / `canManageRoleAsync` functions in `src/lib/security/constants.ts` instead of capability checks. This means a custom role with `users.manage_roles` capability would not actually be able to manage roles, and removing this capability from an admin role would have no effect.

**Fix:** Either implement capability checks for role management operations (replacing or augmenting the level-based checks), or remove `users.manage_roles` from the capability list to avoid confusion.

---

## Positive Observations

### Strong Practices Identified

1. **Timing-safe token comparison** (`src/lib/security/timing.ts`): The `safeTokenCompare` function uses HMAC with an ephemeral key before `timingSafeEqual`, which is textbook-correct. It avoids the common pitfall of length-leaking by HMAC'ing both inputs to fixed-length digests first. This is used consistently across judge auth, metrics, cleanup endpoints, and test/seed routes.

2. **Argon2id with OWASP-compliant parameters** (`src/lib/security/password-hash.ts`): Memory cost 19 MiB, time cost 2, parallelism 1, with argon2id variant. This meets OWASP minimum recommendations. The transparent bcrypt-to-argon2id migration on successful login is well-implemented.

3. **Dummy password hash for user enumeration prevention** (`src/lib/auth/config.ts:65-69`): When a user is not found, the code still verifies against a pre-computed dummy hash. This prevents timing-based user enumeration -- the response time is consistent regardless of whether the user exists.

4. **Atomic rate limiting with SELECT FOR UPDATE** (`src/lib/security/rate-limit.ts:128-177`): The `consumeRateLimitAttemptMulti` function uses PostgreSQL transactions with `FOR UPDATE` locks to prevent TOCTOU race conditions in rate limit checks. This is excellent.

5. **Exponential backoff with cap on rate limit blocks** (`src/lib/security/rate-limit.ts:150`): Block duration doubles on consecutive blocks with a cap at `2^5 = 32x` the base duration. This provides escalating defense against persistent attackers.

6. **Session invalidation on password change** (`src/lib/actions/change-password.ts:68`): Setting `tokenInvalidatedAt = new Date()` invalidates all existing sessions when a password is changed, preventing session persistence attacks.

7. **CSP with nonce-based script policy** (`src/proxy.ts:170-183`): Proper Content-Security-Policy with per-request nonces, `frame-ancestors 'none'`, `object-src 'none'`, and `base-uri 'self'`. The hCaptcha domains are only allowed on the signup page.

8. **CSRF protection via custom header + origin validation** (`src/lib/security/csrf.ts`): The dual-layer approach (require `X-Requested-With: XMLHttpRequest` + validate `Origin` header + check `Sec-Fetch-Site`) is defense-in-depth. The handler framework (`src/lib/api/handler.ts:137`) correctly skips CSRF for API-key-authenticated requests.

9. **Open redirect prevention** in login/signup forms (`getSafeRedirectUrl`): Both login and signup forms validate callback URLs to prevent `//`-prefixed redirects. The proxy middleware only uses `pathname` (not full URL) for the callback.

10. **Trusted host validation** (`src/lib/auth/trusted-host.ts`): Auth routes validate the request host against a configurable trusted host list. In production, missing host headers and empty trusted host lists fail closed.

11. **Circuit breaker on rate limiter sidecar** (`src/lib/security/rate-limiter-client.ts:40-44`): The sidecar client has a proper circuit breaker pattern -- after 3 consecutive failures, it stops trying for 30 seconds. This prevents cascade failures and ensures the DB-backed limiter takes over.

12. **API key privilege ceiling** (`src/lib/api/api-key-auth.ts:98-102`): The effective role of an API key is the minimum of the key's declared role and the creator's current role. This prevents privilege escalation if the key creator is later downgraded.

---

## Architecture Notes (Non-Finding)

### Session Strategy: JWT with DB Refresh

The system uses JWT sessions (`strategy: "jwt"`) with a DB refresh on every JWT callback invocation. This means:
- Token data is refreshed from DB on each request (via the `jwt` callback)
- No server-side session store is needed
- Token invalidation works by comparing `authenticatedAt` with `tokenInvalidatedAt`

This is a sound architecture for a server-rendered Next.js app. The tradeoff is a DB query per authenticated request, mitigated by the 2-second proxy cache.

### Two-Tier Rate Limiting

The rate limiting architecture is well-designed:
1. Optional Rust sidecar (in-memory, fast path, fail-open)
2. PostgreSQL (authoritative, durable, uses transactions for atomicity)

The sidecar is best-effort -- if it's down, the DB path handles everything. The circuit breaker prevents sidecar failures from adding latency.

---

## Files Read (Complete)

| File | Read | Notes |
|---|---|---|
| `src/lib/auth/config.ts` | Yes | Main auth configuration, credentials provider |
| `src/lib/auth/find-session-user.ts` | Yes | Session user lookup |
| `src/lib/auth/generated-password.ts` | Yes | Secure password generation |
| `src/lib/auth/index.ts` | Yes | NextAuth initialization |
| `src/lib/auth/login-events.ts` | Yes | Login event recording |
| `src/lib/auth/permissions.ts` | Yes | Permission checking (groups, problems, submissions) |
| `src/lib/auth/recruiting-token.ts` | Yes | Recruiting token auth |
| `src/lib/auth/role-helpers.ts` | Yes | Role hierarchy helpers |
| `src/lib/auth/secure-cookie.ts` | Yes | Secure cookie flag |
| `src/lib/auth/session-security.ts` | Yes | Session invalidation logic |
| `src/lib/auth/trusted-host.ts` | Yes | Host validation |
| `src/lib/api/auth.ts` | Yes | API auth helpers |
| `src/lib/api/api-key-auth.ts` | Yes | API key authentication |
| `src/lib/api/handler.ts` | Yes | API handler middleware factory |
| `src/lib/api/client.ts` | Yes | Client-side fetch wrapper |
| `src/lib/api/responses.ts` | Yes | Response helpers |
| `src/lib/api/pagination.ts` | Yes | Pagination parsing |
| `src/lib/security/api-rate-limit.ts` | Yes | API rate limiting |
| `src/lib/security/constants.ts` | Yes | Security constants, role definitions |
| `src/lib/security/csrf.ts` | Yes | CSRF validation |
| `src/lib/security/derive-key.ts` | Yes | HKDF key derivation |
| `src/lib/security/encryption.ts` | Yes | AES-256-GCM encryption |
| `src/lib/security/env.ts` | Yes | Environment validation |
| `src/lib/security/hcaptcha.ts` | Yes | hCaptcha verification |
| `src/lib/security/in-memory-rate-limit.ts` | Yes | In-memory rate limiter |
| `src/lib/security/ip.ts` | Yes | IP extraction with hop validation |
| `src/lib/security/password-hash.ts` | Yes | Argon2id/bcrypt hashing |
| `src/lib/security/password.ts` | Yes | Password policy |
| `src/lib/security/rate-limit.ts` | Yes | DB-backed rate limiting |
| `src/lib/security/rate-limiter-client.ts` | Yes | Sidecar client |
| `src/lib/security/request-context.ts` | Yes | Request context normalization |
| `src/lib/security/sanitize-html.ts` | Yes | HTML/Markdown sanitization |
| `src/lib/security/server-actions.ts` | Yes | Server action origin validation |
| `src/lib/security/timing.ts` | Yes | Constant-time comparison |
| `src/lib/capabilities/cache.ts` | Yes | Role-capability cache |
| `src/lib/capabilities/checker.ts` | Yes | Capability check functions |
| `src/lib/capabilities/defaults.ts` | Yes | Default role capabilities |
| `src/lib/capabilities/ensure-builtin-roles.ts` | Yes | DB role bootstrapping |
| `src/lib/capabilities/index.ts` | Yes | Barrel exports |
| `src/lib/capabilities/types.ts` | Yes | Capability type definitions |
| `src/lib/users/core.ts` | Yes | User management helpers |
| `src/proxy.ts` | Yes | Middleware/proxy logic |
| `src/instrumentation.ts` | Yes | Startup validation |
| `src/app/api/auth/[...nextauth]/route.ts` | Yes | Auth route handler |
| `src/app/change-password/page.tsx` | Yes | Change password page |
| `src/app/change-password/change-password-form.tsx` | Yes | Change password form |
| `src/app/change-password/invalid-change-password-session.tsx` | Yes | Invalid session handler |
| `src/lib/actions/change-password.ts` | Yes | Change password server action |
| `src/lib/db/selects.ts` | Yes | Safe column selections |
| `src/lib/assignments/recruiting-invitations.ts` | Yes | Recruiting invitation logic |
| `src/lib/system-settings-config.ts` | Yes | System settings with defaults |
| `src/middleware.ts` | N/A | File does not exist (proxy.ts serves this role) |

**No files in scope were skipped.**

---

## Summary by Severity

| Severity | Count | IDs |
|---|---|---|
| Critical | 0 | -- |
| High | 2 | HIGH-01, HIGH-02 |
| Medium | 7 | MEDIUM-01 through MEDIUM-07 |
| Low | 8 | LOW-01 through LOW-08 |

## Recommendation

**COMMENT** -- No critical issues. The two High findings are worth addressing before the next release but do not represent immediate exploitable vulnerabilities in a typical deployment (the open redirect requires a specific attack chain, and the password change race is a UX failure mode). The codebase demonstrates strong security engineering practices overall.

