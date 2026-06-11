# Security Review — RPF Cycle 19 (Updated)

**Date:** 2026-04-22
**Reviewer:** security-reviewer
**Base commit:** 6df94cb1

## Previous Findings Status

| ID | Finding | Status |
|----|---------|--------|
| SEC-1 | execCommand deprecated clipboard fallback | FIXED (api-keys-client uses copyToClipboard which handles this) |

## New Findings

### SEC-3: Raw server error messages displayed to users — potential information disclosure [MEDIUM/MEDIUM]

**Files:**
- `src/app/(dashboard)/dashboard/submissions/[id]/_components/comment-section.tsx:78`
- `src/app/(dashboard)/dashboard/admin/users/bulk-create-dialog.tsx:214`

**Description:** These locations pass raw server error strings to `toast.error()`. The server error string could contain internal implementation details (SQL constraints, stack traces, file paths) that should not be exposed to end users. This is an OWASP A01:2021 (Broken Access Control) / A05:2021 (Security Misconfiguration) concern — exposing internal error details aids attackers in understanding the system.

**Concrete failure scenario:** A database constraint violation returns `{ "error": "duplicate key value violates unique constraint \"users_email_key\"" }`. This reveals the table name (`users`) and column name (`email`) to the end user, aiding reconnaissance.

**Fix:** Replace `toast.error(rawError ?? label)` with `console.error(rawError); toast.error(label)` pattern. Use localized user-facing messages only.

---

### SEC-4: No new critical security regressions found [INFO/N/A]

**Description:** The codebase continues to maintain strong security practices:
- HTML sanitization uses DOMPurify with strict allowlists
- No `as any`, `@ts-ignore`, or `@ts-expect-error`
- Auth flow robust with Argon2id, timing-safe dummy hash, rate limiting
- CSRF protection consistent across all mutation routes
- Proxy middleware correctly uses `"mustChangePassword"` key (not English string)
- Clipboard utility (`copyToClipboard`) properly handles fallback failures
