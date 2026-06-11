# Security Review — RPF Cycle 20 (Fresh)

**Date:** 2026-04-24
**Reviewer:** security-reviewer
**Base commit:** 9bd909a2

## Previous Findings Status

All previously identified security issues confirmed FIXED. The `.json()` `.catch()` pattern is now consistently applied across client-side code. `hcaptchaSecret` is in both the logger redact paths and export redaction maps.

## New Findings

### SEC-1: Information disclosure via raw server errors in toast — 5 locations [MEDIUM/HIGH]

**Files:**
- `src/app/(dashboard)/dashboard/groups/[id]/group-instructors-manager.tsx:73`
- `src/app/(dashboard)/dashboard/admin/languages/language-config-table.tsx:137,160,187`
- `src/app/(dashboard)/dashboard/admin/settings/database-backup-restore.tsx:146`
- `src/app/(dashboard)/dashboard/problems/problem-import-button.tsx:38`

**Description:** These locations expose raw server error strings to the user. This is OWASP A01:2021 (Broken Access Control) / A05:2021 (Security Misconfiguration). The server error string could contain SQL constraint names, stack traces, file paths, or other internal details.

The most dangerous variant is in `database-backup-restore.tsx:146` where the raw error is used as a `t()` translation key — if it doesn't match a key, the raw string is shown verbatim.

**Fix:** Use `console.error(rawError); toast.error(localizedLabel)` pattern for all locations.

---

### SEC-2: No new critical security regressions found [INFO/N/A]

**Description:** Security posture remains strong:
- HTML sanitization uses DOMPurify with strict allowlists
- No `as any`, `@ts-ignore`, or `@ts-expect-error`
- Auth flow robust (Argon2id, timing-safe dummy hash, rate limiting)
- CSRF protection consistent across mutation routes
- Proxy middleware correctly enforces must-change-password redirects
- Cleanup endpoint gated behind ENABLE_CRON_CLEANUP opt-in
- Judge worker registration uses hashed secrets (plaintext secretToken dropped)
- Export redaction properly covers passwordHash, encryptedKey, hcaptchaSecret
- Logger redact paths cover authorization, passwords, tokens, secrets
