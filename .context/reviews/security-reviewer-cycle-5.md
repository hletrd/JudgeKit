# Security Reviewer — Cycle 5 (Loop 5/100)

**Date:** 2026-04-24
**HEAD commit:** b7a39a76 (no source changes since cycle 4)

## Methodology

OWASP Top-10 focused review: injection, auth bypass, CSRF, XSS, SSRF, secrets, access control. Examined auth flow, API key auth, CSRF protection, CSP headers, file upload security, encryption, recruiting token flow, and Docker container sandboxing.

## Findings

**No new security findings.** No source code has changed since cycle 4.

### Verified Security Posture

- **Auth**: JWT-based with session invalidation via `tokenInvalidatedAt`. `clearAuthToken()` sets `authenticatedAt = 0` to close revocation bypass window. API key auth uses SHA-256 hashed keys with AES-256-GCM encryption at rest.
- **CSRF**: `X-Requested-With: XMLHttpRequest` header required for mutations. Origin validation against configured `AUTH_URL`. API key requests bypass CSRF (no cookies involved).
- **XSS**: DOMPurify sanitization for HTML descriptions. `dangerouslySetInnerHTML` used only with `sanitizeHtml()` or `safeJsonForScript()`. React-markdown with `skipHtml` for problem descriptions.
- **CSP**: Comprehensive Content-Security-Policy set in proxy middleware with nonce-based script-src. `frame-ancestors 'none'`, `object-src 'none'`, `form-action 'self'`.
- **File Upload**: MIME type validation, size limits, ZIP bomb protection, path traversal guard in `resolveStoredPath()` (rejects `/`, `\\`, `..`), image reprocessing via sharp.
- **Docker Sandbox**: Network disabled, memory/CPU limits, seccomp profile, `--cap-drop=ALL`, `--security-opt=no-new-privileges`, non-root user (65534:65534), PID limits, read-only filesystem with tmpfs.
- **SSRF**: No user-controlled URLs in server-side fetch calls. External fetch targets are hardcoded (OpenAI, Anthropic, Gemini, hCaptcha). Gemini model ID validated against safe pattern before URL construction.
- **Rate Limiting**: Two-tier (sidecar + PostgreSQL with SELECT FOR UPDATE). IP-based and username-based for login. Per-endpoint for API routes.
- **Encryption**: AES-256-GCM for plugin config and API keys. Production requires env var; dev fallback with fixed key.
- **Session Security**: Token invalidation check on every JWT refresh. Password re-verification for database restore.

### Observations

1. **JWT `authenticatedAt` uses app-server time** — `src/lib/auth/config.ts:352` uses `Date.now()` instead of DB time for the sign-in timestamp. This is the same class as deferred item AGG-2 but applies specifically to the auth token creation path. Impact: up to a few seconds of clock-skew window on token revocation. **Severity: LOW**. **Confidence: MEDIUM**.

## Carry-Over Deferred Items

All 23 deferred security items from cycle 4 aggregate remain valid and unchanged.
