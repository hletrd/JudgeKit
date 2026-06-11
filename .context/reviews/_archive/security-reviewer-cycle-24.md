# Security Reviewer — Cycle 24

**Date:** 2026-04-24
**Reviewer:** security-reviewer
**Scope:** Full repository — OWASP Top 10, secrets, unsafe patterns, auth/authz

---

## Findings

### S-1: [MEDIUM] Missing `Referrer-Policy` Header Leaks Contest Access Tokens in Referer

**Confidence:** HIGH
**Citations:** `src/proxy.ts:144-229`

The proxy middleware does not set a `Referrer-Policy` header. Browsers default to `no-referrer-when-downgrade`, which sends the full URL (including path and query string) as the `Referer` header to same-origin and HTTPS-to-HTTPS navigations.

The contest join page constructs URLs like `/dashboard/contests/join?code=ACCESS_CODE_HERE` (see `src/components/contest/access-code-manager.tsx:137`). If any external link exists on the contest page, or if the user's browser has extensions that load external resources, the contest access code is leaked in the `Referer` header.

**Concrete failure scenario:** A student navigates to a contest with an access code in the URL. The page contains a link to an external resource (or a browser extension injects one). The full URL with `?code=SECRET_CODE` is sent in the Referer header.

**Fix:** Add `Referrer-Policy: strict-origin-when-cross-origin` to the proxy response headers. This sends only the origin (not the full URL) to cross-origin destinations.

---

### S-2: [MEDIUM] Missing `X-Content-Type-Options: nosniff` on Most Responses

**Confidence:** HIGH
**Citations:** `src/proxy.ts:144-229`, `src/app/api/v1/files/[id]/route.ts:115`

The proxy middleware sets CSP, HSTS, and frame-ancestors but does not set `X-Content-Type-Options: nosniff`. The `nosniff` header is only present on the file download route. Without it, browsers may MIME-sniff API responses and interpret them as executable content (e.g., HTML or script). While the CSP's `default-src 'self'` and `script-src` restrict script execution, `nosniff` is a defense-in-depth header recommended by OWASP.

**Concrete failure scenario:** An API endpoint returns user-controlled content with an incorrect `Content-Type`. Without `nosniff`, the browser may interpret it as HTML and execute inline scripts if CSP allows it (e.g., in development mode where `'unsafe-eval'` is present).

**Fix:** Add `response.headers.set("X-Content-Type-Options", "nosniff");` in `createSecuredNextResponse`.

---

### S-3: [LOW] Argon2 `needsRehash` Not Checked for Non-Parameter Changes

**Confidence:** LOW
**Citations:** `src/lib/security/password-hash.ts:30-41`

`verifyPassword` returns `needsRehash: false` for Argon2 hashes even when the Argon2 parameters (memoryCost, timeCost, parallelism) may differ from the currently configured `ARGON2_OPTIONS`. The `argon2.verify()` function only validates the password, not whether the hash parameters match the current policy. If `ARGON2_OPTIONS` is tightened in the future (e.g., memoryCost increased from 19 MiB to 64 MiB), existing hashes will not be automatically rehashed.

**Concrete failure scenario:** Admin increases `ARGON2_OPTIONS.memoryCost` from 19456 to 65536. Existing users with old hashes continue using the weaker parameters indefinitely because `needsRehash` always returns `false` for Argon2 hashes.

**Fix:** After a successful Argon2 verification, check `argon2.needsRehash(storedHash, ARGON2_OPTIONS)` and return `needsRehash: true` if parameters differ.

---

### S-4: [LOW] Recruiting Token Logged as Fingerprint After Failed Authentication

**Confidence:** LOW
**Citations:** `src/lib/auth/recruiting-token.ts:33`

The recruiting token fingerprint (`sha256(token).slice(0, 8)`) is included in the login event even after a failed `redeemRecruitingToken` call (line 19 logs the error). The fingerprint is only 8 hex characters (32 bits), which is a small search space but may help narrow down the token value for an attacker who can read the logs.

**Concrete failure scenario:** An attacker with log access sees `recruit:a1b2c3d4` in the login event. They can brute-force the first 8 hex chars of SHA-256(token) to narrow down candidate tokens. However, the full SHA-256 preimage is still infeasible.

**Fix:** Consider not logging the token fingerprint on failed redemptions, or increase the fingerprint length to 16+ hex characters.

---

## Files Reviewed

- `src/proxy.ts` (full)
- `src/lib/security/password-hash.ts` (full)
- `src/lib/security/sanitize-html.ts` (full)
- `src/lib/security/derive-key.ts` (full)
- `src/lib/security/timing.ts` (referenced)
- `src/lib/auth/config.ts` (full)
- `src/lib/auth/recruiting-token.ts` (full)
- `src/lib/auth/session-security.ts` (referenced)
- `src/lib/judge/auth.ts` (full)
- `src/lib/realtime/realtime-coordination.ts` (full)
- `src/lib/logger.ts` (full)
- `src/lib/db/queries.ts` (full)
- `src/lib/db/like.ts` (full)
- `src/lib/db/import.ts` (full)
- `src/lib/db/export.ts` (referenced)
- `src/lib/files/storage.ts` (full)
- `src/lib/files/validation.ts` (full)
- `src/lib/data-retention.ts` (full)
- `src/app/api/v1/submissions/[id]/events/route.ts` (full)
- `src/app/api/v1/files/[id]/route.ts` (full)
- `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts` (full)
