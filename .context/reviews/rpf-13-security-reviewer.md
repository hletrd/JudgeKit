# RPF Cycle 13 — Security Reviewer

**Date:** 2026-04-20
**Reviewer:** security-reviewer

---

## SEC-1: Client-side expiry check could mislead users about invitation status [LOW/MEDIUM]

**File:** `src/components/contest/recruiting-invitations-panel.tsx:248`
**Problem:** The expired badge on recruiting invitations uses `new Date()` (browser clock) instead of a server-provided `isExpired` flag. While the server correctly validates expiry using `NOW()` in the atomic SQL claim, a user with a wrong browser clock could see incorrect status badges. This is NOT a security vulnerability — the server is the authoritative gate — but it creates a misleading UX that could cause users to attempt redeeming expired tokens (which would fail) or skip redeeming valid tokens they think are expired.
**Fix:** Add a server-computed `isExpired` boolean to the API response for the invitations list.
**Confidence:** MEDIUM

## SEC-2: Client-side API key expiry status uses browser clock [LOW/MEDIUM]

**File:** `src/app/(dashboard)/dashboard/admin/api-keys/api-keys-client.tsx:270`
**Problem:** Same pattern as SEC-1. The API key "expired" badge uses browser time. The server validates API key expiry using DB time at authentication time, so this is purely a display issue.
**Fix:** Include `isExpired` in the API key list response from the server.
**Confidence:** MEDIUM

## SEC-3: Backup filename on client side uses browser clock [LOW/LOW]

**File:** `src/app/(dashboard)/dashboard/admin/settings/database-backup-restore.tsx:52`
**Problem:** The client-side download code generates its own filename using `new Date()` instead of using the `Content-Disposition` header from the server response (which already contains a DB-time-based filename). This means the downloaded file's name doesn't match the DB-time snapshot inside, which could cause confusion during disaster recovery.
**Fix:** Parse the `Content-Disposition` header from the response to get the correct filename, or at minimum, accept the current cosmetic mismatch.
**Confidence:** LOW

## Verified Safe

- Auth flow: Argon2id password hashing, timing-safe dummy hash for nonexistent users, rate limiting — all intact.
- CSRF protection: present on all mutating API routes with cookie-based auth; skipped for API key auth (correct).
- Recruiting token: atomic SQL claim with `NOW()` prevents TOCTOU on expiry.
- Password re-confirmation required for backup download.
- Transparent bcrypt-to-argon2 rehash on password re-entry.
- Backup integrity: SHA-256 checksums, manifest validation, path traversal protection on restore.
- No SQL injection: all raw SQL uses parameterized values via Drizzle.
- LIKE patterns properly escaped with `escapeLikePattern()`.
- No `dangerouslySetInnerHTML` without sanitization.
- File upload: ZIP bomb protection, size limits, path traversal protection.
- Rate limiting uses `SELECT FOR UPDATE` for TOCTOU prevention.
- Session revocation uses DB-time `tokenInvalidatedAt`.
- API key auth: encrypted keys, proper validation.
