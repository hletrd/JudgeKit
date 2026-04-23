# RPF Cycle 2 — Security Reviewer

**Date:** 2026-04-22
**Base commit:** 14218f45

## Findings

### SEC-1: `recruiting-invitations-panel.tsx` constructs invitation URL client-side using `window.location.origin` — potential open redirect vector in misconfigured proxies [LOW/MEDIUM]

**File:** `src/components/contest/recruiting-invitations-panel.tsx:95,181,207`
**Description:** The component uses `const baseUrl = typeof window !== "undefined" ? window.location.origin : ""` to build invitation links like `${baseUrl}/recruit/${token}`. In most deployment scenarios, `window.location.origin` is trustworthy. However, if the app is behind a misconfigured reverse proxy that doesn't strip/override `X-Forwarded-Host` or `X-Forwarded-Proto` headers, the browser's `window.location.origin` could reflect attacker-controlled values. This is particularly relevant given that the contest layout already has a workaround for RSC streaming corruption caused by proxy headers (see `contests/layout.tsx`).
**Concrete failure scenario:** An attacker sends a crafted `X-Forwarded-Host: evil.com` header through a misconfigured proxy. The generated invitation link becomes `https://evil.com/recruit/TOKEN`. When shared with a legitimate user, they visit the attacker's site instead.
**Fix:** Consider using a server-provided `appUrl` config value instead of relying on `window.location.origin` for constructing invitation URLs. At minimum, validate that the origin matches expected patterns.

### SEC-2: `recruiting/validate/route.ts` does not use `createApiHandler` — inconsistent auth/CSRF/rate-limit patterns [LOW/LOW]

**File:** `src/app/api/v1/recruiting/validate/route.ts`
**Description:** This route is a raw route handler that manually implements rate limiting but does not go through `createApiHandler`. It has no auth check (intentionally — it's an anonymous endpoint) and no CSRF check. Since it only reads from the request body (POST with JSON), the lack of CSRF protection is acceptable because `createApiHandler` also skips CSRF for non-form-based requests. However, this route is inconsistent with the project's pattern of using `createApiHandler` for new routes. This is a maintainability concern more than a security concern.
**Fix:** Consider migrating to `createApiHandler({ auth: false, rateLimit: "recruiting:validate", ... })` for consistency.

### SEC-3: `files/route.ts` POST handler is a raw route — not using `createApiHandler` but implements same checks manually [INFO/INFO]

**File:** `src/app/api/v1/files/route.ts:20-141`
**Description:** The file upload POST handler manually implements auth, CSRF, and rate limiting rather than using `createApiHandler`. This is understandable because file uploads use `FormData` instead of JSON. The manual implementation correctly mirrors the `createApiHandler` logic. No security gap found, but this is a maintainability risk — if `createApiHandler` gains new middleware (e.g., request logging), this handler would miss it.
**Fix:** Consider adding a `createApiHandler` variant that supports `FormData` uploads.

## Verified Safe

- All `createApiHandler` routes have consistent auth, CSRF, and rate limiting
- Judge routes use IP allowlist + shared token/worker token auth — appropriate for internal API
- SSE events route has connection limits and periodic re-authentication
- Password hashing uses Argon2id with OWASP-recommended parameters
- Dummy password hash prevents user enumeration via timing
- Recruiting token validation uses SQL `NOW()` for expiry — no clock skew
- `recruiting/validate/route.ts` returns uniform `{ valid: false }` for all failure cases — no information leakage
- All clipboard operations now use the shared `copyToClipboard` utility with fallback
