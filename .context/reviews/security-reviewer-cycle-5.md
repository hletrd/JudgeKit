# Security Reviewer Report — Cycle 5/100 (RPF Run)

**Date:** 2026-05-09
**HEAD:** 6fc4a4a2
**Scope:** Security-focused review of auth, API routes, data handling, and SSE coordination

---

## Findings

### C5-SR-1: Backup ZIP path-traversal check is not exhaustive [LOW]

- **Severity:** LOW
- **Confidence:** MEDIUM
- **File+line:** `src/lib/db/export-with-files.ts:258-260`
- **Issue:** `restoreFilesFromZip` checks for `/`, `\\`, and `..` in stored names. While this blocks common traversal patterns, ZIP extractors (including JSZip) may normalize certain encoded sequences (e.g., URL-encoded `..`, Unicode homoglyphs, or NTFS alternate data streams) differently. The threat model is low — backups are admin-generated and integrity-checked — but the defense-in-depth could be stronger.
- **Fix:** Use a whitelist approach (alphanumeric + safe separators) or normalize via `path.normalize()` before validation.

### C5-SR-2: SSE events route does not validate `sseConfig.sseTimeoutMs` before use [LOW]

- **Severity:** LOW
- **Confidence:** MEDIUM
- **File+line:** `src/app/api/v1/submissions/[id]/events/route.ts:367-372`
- **Issue:** `setTimeout(() => { ... }, sseConfig.sseTimeoutMs)` uses the configured timeout directly. If an admin sets `sseTimeoutMs` to a non-finite value (NaN, Infinity) or a negative value via the settings UI, `setTimeout` treats NaN as 0 (fires immediately) and negative values as 0 in some environments. This could cause immediate SSE timeouts. `getConfiguredSettings()` does not validate numeric bounds.
- **Fix:** Add a defensive guard: `const timeoutMs = Math.max(1000, Number.isFinite(sseConfig.sseTimeoutMs) ? sseConfig.sseTimeoutMs : 300_000);`

---

## Areas Verified (No Issues Found)

- **CSRF coverage:** All 9 mutating POST endpoints verified — protected or correctly exempted.
- **Rate limiting:** DB-backed, atomic with advisory locks.
- **SQL injection:** All raw SQL uses parameterized values or constant patterns.
- **XSS:** `dangerouslySetInnerHTML` only used with DOMPurify/safeJsonForScript.
- **Auth pipeline:** JWT sign-in uses DB time, session invalidation, dummy hash, and rate-limit clearing verified.
- **Encryption:** AES-256-GCM with plaintext fallback documented.
- **File access:** `files/[id]/route.ts` properly checks permissions before serving.

---

## Already-fixed findings verified at HEAD

All cycle 1-21 fixes remain resolved. No new security vulnerabilities found.
