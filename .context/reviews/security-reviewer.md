# Security Reviewer

**Date:** 2026-04-19
**Base commit:** b91dac5b
**Angle:** OWASP top 10, secrets, unsafe patterns, auth/authz

---

## F1: Proxy deletes `x-forwarded-host` header unconditionally — fragile dependency on auth-route exclusion

- **File**: `src/proxy.ts:148`
- **Severity**: MEDIUM
- **Confidence**: HIGH
- **Description**: The proxy deletes the `x-forwarded-host` header from ALL requests with the comment "Next.js 16 RSC bug: X-Forwarded-Host from nginx corrupts RSC streaming during client-side navigation." However, this header is also used by `validateTrustedAuthHost` (in `src/lib/auth/trusted-host.ts`) to determine the request host for the auth callback URL. The auth routes (`/api/auth/`) are explicitly excluded from the proxy matcher, so the deletion does not currently affect auth callbacks. However, the unconditional deletion is fragile — any future change to the proxy matcher could break auth.
- **Concrete failure scenario**: A developer adds `/api/auth/` to the proxy matcher (or removes the exclusion). The proxy then deletes `x-forwarded-host` from auth callback requests. `validateTrustedAuthHost` falls back to the `host` header, which may be the internal container hostname (e.g., `localhost:3000`), causing an `UntrustedHost` rejection. This is the exact failure that was observed in the live browser audit (cycle 2 aggregate AGG-1).
- **Fix**: Add a code comment at line 148 explaining that the deletion is safe ONLY because auth routes are excluded from the proxy matcher. Consider making the deletion conditional on the route not being an auth route.

## F2: Chat widget streaming responses bypass `createApiHandler` error normalization

- **File**: `src/app/api/v1/plugins/chat-widget/chat/route.ts:88-96`
- **Severity**: LOW
- **Confidence**: MEDIUM
- **Description**: The chat widget endpoint uses `createApiHandler` but returns raw `Response` objects with `as unknown as NextResponse` casts for streaming responses. This bypasses the handler's error normalization and response wrapping. If the streaming response encounters an error after headers are sent, the error is propagated as a raw stream failure rather than a structured API error. The `buildLoggedStreamingResponse` function handles some error cases but does not produce the standard `{ error: string }` JSON format.
- **Concrete failure scenario**: An AI provider returns a 402 (payment required) error during streaming. The error is not caught by `createApiHandler`'s error handler and the client receives a raw error response instead of a structured API error.
- **Fix**: This is a known limitation of streaming responses with `createApiHandler`. The current implementation logs errors via `persistChatMessage`, which is adequate for debugging. No immediate fix needed, but document the limitation.

## F3: `getAllowedHostsFromDb` silently returns empty on DB failure — may lock out all auth in production

- **File**: `src/lib/security/env.ts:141-150`
- **Severity**: LOW
- **Confidence**: MEDIUM
- **Description**: `getAllowedHostsFromDb` catches all errors and returns an empty array with a warning log. If the DB is unreachable during auth, the only trusted host is the one from `AUTH_URL`. This is correct behavior (fail-closed rather than fail-open), but if `AUTH_URL` is misconfigured or the host doesn't match the request host, all auth requests will be rejected with `UntrustedHost` even though the DB has the correct allowed hosts.
- **Concrete failure scenario**: The DB connection is temporarily lost. A user tries to log in. The trusted-host check only has `AUTH_URL`'s host, which is correct. The user can log in. But if `AUTH_URL` is set to an internal hostname (e.g., `http://localhost:3000`) and the request comes through the reverse proxy with the external hostname, the user gets `UntrustedHost` and cannot log in until the DB recovers.
- **Fix**: This is a reasonable fail-closed behavior. The mitigation is ensuring `AUTH_URL` matches the external hostname. Consider adding a startup validation that warns if `AUTH_URL` doesn't match any expected external hostname.

## Previously Verified Safe (Prior Cycles)

- Encryption key handling — production throws if `NODE_ENCRYPTION_KEY` is missing
- `decrypt` plaintext fallback — necessary for backward compatibility, `parts.length !== 4` check catches most corruption
- SQL parameter binding — `namedToPositional` uses parameterized queries, no injection risk
- `sanitizeHtml` uses DOMPurify — XSS protection is in place
- `dangerouslySetInnerHTML` uses `safeJsonForScript()` and `sanitizeHtml()` respectively
- CSRF protection — mutation API routes require `X-Requested-With: XMLHttpRequest`
