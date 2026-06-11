# Security Reviewer — Cycle 26

**Date:** 2026-04-25
**Scope:** Full repository

---

## S-1: [HIGH] `rateLimitedResponse` sidecar path leaks app-server clock via `X-RateLimit-Reset` header

**File:** `src/lib/security/api-rate-limit.ts:123, 162, 196`
**Confidence:** HIGH

(Duplicates CR-1 from a security angle.) When the sidecar rejects a request, `rateLimitedResponse(windowMs)` is called without `nowMs`, falling back to `Date.now()`. This leaks the app server's clock in the `X-RateLimit-Reset` header. In a multi-instance deployment, different instances may have different clock offsets, making the header unreliable for clients and potentially revealing internal network timing information.

**Fix:** Make `nowMs` required. Pass `await getDbNowMs()` at all call sites.

---

## S-2: [LOW] SSE cleanup timer uses `Date.now()` for staleness

**File:** `src/app/api/v1/submissions/[id]/events/route.ts:111`
**Confidence:** LOW

The SSE stale connection cleanup timer uses `Date.now()` to compare against `info.createdAt`. Since `createdAt` is set using `Date.now()` at connection creation time, this is internally consistent — both use the same clock. However, if the cleanup were ever changed to use DB time for one side but not the other, it could cause premature or delayed eviction. This is a minor observation, not a bug.

---

## Positive security observations

- No `eval()`, `new Function()`, or `Math.random()` in security-critical paths
- No `as any` type casts in server code
- `sanitizeHtml` uses DOMPurify with narrow tag/attribute allowlists and URI scheme restriction
- `safeJsonForScript` in `json-ld.tsx` properly escapes `</script` and `<!--` sequences
- `resolveStoredPath` properly prevents path traversal
- `namedToPositional` validates parameter names and prevents SQL injection
- `safeTokenCompare` is used for CRON_SECRET comparison (timing-safe)
- CSRF protection is enforced for mutation methods via `createApiHandler`
- API key auth bypasses CSRF (correct — no cookies involved)
- Password validation checks against common passwords and username/email matching
- Argon2id is used for password hashing (confirmed from prior cycles)
