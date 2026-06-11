# RPF Cycle 15 — Security Reviewer

**Date:** 2026-04-20
**Base commit:** f0bef9cb

## Findings

### SEC-1: Recruiting invitation `expiryDate` lacks upper-bound validation — allows arbitrarily far-future expiry [MEDIUM/MEDIUM]

**File:** `src/lib/validators/recruiting-invitations.ts:10`, `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/route.ts:72-79`

The `expiryDate` validator is `z.string().regex(/^\d{4}-\d{2}-\d{2}$/)` — it only validates the format. Unlike `expiryDays` which is constrained to `max(3650)`, a client can pass any date string including `2099-12-31`, creating an invitation that never expires. This is the same class of vulnerability as the original AGG-1 from rpf-14 (arbitrary `expiresAt` timestamp), but now through the `expiryDate` field instead.

**Concrete attack scenario:** A user with `recruiting.manage_invitations` capability creates an invitation with `expiryDate: "2099-12-31"`. The server computes `expiresAt = new Date("2099-12-31T23:59:59Z")`, which passes the `expiresAt <= dbNow` check (it's in the future). The invitation effectively never expires.

**Fix:** Add a maximum date range validation in the route handler (after computing `expiresAt`):
```typescript
const MAX_EXPIRY_YEARS = 10;
if (expiresAt && (expiresAt.getTime() - dbNow.getTime()) > MAX_EXPIRY_YEARS * 365.25 * 86400000) {
  return apiError("expiryDateTooFar", 400);
}
```

**Confidence:** MEDIUM

### SEC-2: Duplicate `getDbNowUncached()` call in recruiting invitations POST [LOW/MEDIUM]

**File:** `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/route.ts:70,77`

Same as CR-1. The `expiryDate` branch fetches `dbNow` a second time. While this doesn't introduce a direct security vulnerability, it creates a potential TOCTOU-like inconsistency between the timestamp used for computing `expiresAt` and the one used for validating it. If both branches used the same `dbNow` fetched once, the comparison would be atomic.

**Confidence:** MEDIUM

## Verified Safe

- All prior security fixes remain intact:
  - Argon2id password hashing with OWASP parameters — verified.
  - Timing-safe dummy hash for non-existent users — verified.
  - Rate limiting on API key creation and backup download — verified.
  - CSRF protection on backup route (skipped for API key auth) — verified.
  - Password re-confirmation required for backup download — verified.
  - CSP headers with nonce-based script-src — verified.
  - HSTS headers — verified.
  - SQL injection: all raw SQL uses parameterized values via Drizzle — verified.
  - LIKE patterns properly escaped with `escapeLikePattern()` — verified.
  - Path traversal validation in backup ZIP extraction — verified.
  - SHA-256 integrity manifest for backups — verified.
  - API key encrypted key always redacted in GET responses — verified.
  - Password hash always redacted — verified.
  - `x-forwarded-host` header deleted in proxy to prevent RSC corruption — verified.
  - Auth cache uses FIFO eviction with configurable TTL — verified.
  - `document.execCommand("copy")` used only as fallback — verified.
