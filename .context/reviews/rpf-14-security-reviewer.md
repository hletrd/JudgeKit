# RPF Cycle 14 - Security Reviewer

**Date:** 2026-04-20
**Base commit:** c39ded3b

## Findings

### SEC-1: API key creation stores client-provided timestamp without validation [MEDIUM/HIGH]

**File:** `src/app/api/v1/admin/api-keys/route.ts:81`
**Code:** `expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,`

**Description:** The API key creation endpoint accepts an arbitrary ISO datetime string from the client and persists it as the `expiresAt` value. While the schema validates it's a valid datetime (`z.string().datetime()`), there is no validation of the timestamp's relationship to the current server time. A malicious or clock-skewed client could:
1. Set `expiresAt` far in the future (e.g., year 2099) to create a key that effectively never expires
2. Set `expiresAt` in the past to immediately invalidate the key
3. Set `expiresAt` to a timestamp that doesn't match the admin's intended expiry duration

The `isExpired` check in the GET endpoint uses `NOW()`, so the server's time is authoritative for *checking* expiry. But the *creation* of the expiry timestamp is entirely controlled by the client.

**Fix:** Accept a duration (e.g., `expiryDays: number`) instead of a computed ISO timestamp. Compute `expiresAt` server-side using `getDbNowUncached()`. Validate that the resulting `expiresAt` is in the future and within a reasonable maximum (e.g., 10 years).

**Confidence:** High

### SEC-2: Recruiting invitation creation stores client-provided timestamp [MEDIUM/HIGH]

**File:** `src/components/contest/recruiting-invitations-panel.tsx:141`
**Related route:** `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/route.ts`

**Description:** Same issue as SEC-1 but for recruiting invitations. The client computes `expiresAt` using browser time and sends it as an ISO string. A clock-skewed or malicious client can set arbitrary expiry timestamps that will be stored verbatim.

**Fix:** Same as SEC-1: accept duration, compute server-side.

**Confidence:** High

### SEC-3: `withUpdatedAt()` defaults to `new Date()` - temporal inconsistency in audit trail [LOW/MEDIUM]

**File:** `src/lib/db/helpers.ts:20`

**Description:** The `withUpdatedAt()` helper falls back to `new Date()` when no `now` parameter is provided. Most callers don't pass `now`, meaning `updatedAt` timestamps across the system use a mix of app-server time and DB-server time. This could cause audit trail inconsistencies where `updatedAt` doesn't match the DB's `NOW()` used elsewhere in the same transaction. While not a direct security vulnerability, it undermines the integrity of the temporal audit trail.

**Fix:** Make `now` required, or default to `getDbNowUncached()`.

**Confidence:** Medium

## Verified Safe

- Auth: Argon2id with OWASP-recommended parameters (19 MiB, time=2, parallelism=1) - verified.
- Transparent bcrypt-to-argon2id rehash on password re-confirmation - verified.
- Password re-confirmation required for backup/restore/export - verified.
- CSRF protection: `X-Requested-With` header check, skipped for API key auth - verified.
- Rate limiting on sensitive endpoints (backup, restore, export, health) - verified.
- SQL injection: all parameterized via Drizzle, LIKE patterns escaped - verified.
- HTML sanitization: DOMPurify with strict allowlist, URI regex filter - verified.
- JSON-LD: `</script` escape prevents tag breakout - verified.
- File path traversal: checked in backup ZIP extraction (`..`, `/`, `\\`) - verified.
- Backup integrity: SHA-256 manifest validation on restore - verified.
- Password hash always redacted even in full-fidelity exports - verified.
- API key encrypted key always redacted even in full-fidelity exports - verified.
