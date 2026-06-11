# RPF Cycle 16 — Security Reviewer

**Date:** 2026-04-20
**Base commit:** 58da97b7

## Findings

### SEC-1: Bulk recruiting invitations `expiryDate` allows past dates — creates immediately-expired invitations [MEDIUM/HIGH]

- **File:** `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/bulk/route.ts:62-68`
- **Description:** The bulk route validates the upper bound of `expiryDate` (`expiryDateTooFar`) but does not validate that the computed `expiresAt` is in the future. The single-create route and PATCH route both reject past dates with `expiryDateInPast`. A past-date invitation is immediately expired, which could be used to create invitations that appear valid in the UI list but are functionally unusable. While not a direct security vulnerability (expired invitations cannot be redeemed), it creates a confusing audit trail and could be used in social engineering ("I sent you an invitation but it says expired — here's a new link").
- **Fix:** Add `if (expiresAt <= dbNow) throw new Error("expiryDateInPast");` in the bulk route's `expiryDate` branch.
- **Confidence:** HIGH

### SEC-2: Unhandled clipboard API rejections could mask security-sensitive operations [LOW/LOW]

- **Files:** `src/app/(dashboard)/dashboard/admin/workers/workers-client.tsx:169`, `src/app/(dashboard)/dashboard/admin/files/file-management-client.tsx:92`, `src/components/contest/recruiting-invitations-panel.tsx:310`
- **Description:** Several clipboard operations lack try/catch. While clipboard failures are not security issues themselves, the false-positive success toasts could mislead users into believing sensitive data (API keys, worker tokens, file URLs) was copied when it wasn't. This is a defense-in-depth concern.
- **Fix:** Wrap all `navigator.clipboard.writeText()` calls in try/catch with error toasts.
- **Confidence:** MEDIUM

## Verified Safe

- Auth flow: Argon2id with OWASP parameters, timing-safe dummy hash, rate limiting, token invalidation — all verified.
- SQL injection: all parameterized, LIKE patterns escaped — verified.
- HTML sanitization: DOMPurify with strict allowlist — verified.
- Path traversal validation in backup ZIP — verified.
- SHA-256 integrity manifest for backups — verified.
- CSP headers with nonce-based script-src — verified.
- All recruiting invitation routes use `getDbNowUncached()` for server-side time — verified.
- `expiryDate` upper-bound validation present in all three routes — verified.
- No `innerHTML` assignments or unsanitized user input rendering — verified.
