# Security Reviewer — Cycle 25

**Date:** 2026-04-24
**Scope:** Full repository security review

---

## S-1: [MEDIUM] `getAssignmentStatusRows` misses windowed-exam late-penalty branch — data inconsistency risk

**Confidence:** HIGH
**Citations:** `src/lib/assignments/submissions.ts:568-578`

(Duplicates CR-1 from code-reviewer perspective with security framing.)

The inline CASE expression in `getAssignmentStatusRows` only applies late penalties when `submitted_at > @deadline` (non-windowed mode). For windowed exams, the penalty should be applied against the per-user `personal_deadline`, not the global deadline. This means windowed-exam submissions that are late relative to the personal deadline but on time relative to the global deadline are scored without penalty on the assignment status page, while the leaderboard correctly penalizes them.

From a security/integrity perspective, this inconsistency could allow a student who notices the discrepancy to submit late (after personal deadline) and see an unpenalized score on the status page, potentially influencing contest strategy based on incorrect data. While the leaderboard is the authoritative source for ranking, the status page is what students and instructors see most frequently.

**Fix:** Replace inline CASE with `buildIoiLatePenaltyCaseExpr()`, add LEFT JOIN to `exam_sessions`.

---

## S-2: [LOW] `authenticateApiKey` fire-and-forget `lastUsedAt` update silently swallows errors

**Confidence:** MEDIUM
**Citations:** `src/lib/api/api-key-auth.ts:104-109`

The `lastUsedAt` update is fire-and-forget with only a `logger.warn` on failure. While this is acceptable for the audit trail purpose, a persistent write failure (e.g., DB connection issues) would mean the `lastUsedAt` field becomes stale, making it impossible for admins to determine which API keys are actually in use. This is an operational concern rather than a security vulnerability.

**Fix:** Consider tracking consecutive `lastUsedAt` write failures and logging an error after a threshold (similar to the audit buffer pattern in `events.ts`).

---

## Positive Observations

- CSP is well-configured with nonce-based script-src and proper frame-ancestors
- `Referrer-Policy` and `X-Content-Type-Options` headers are now set (cycle 24 fix)
- HSTS is properly configured with `includeSubDomains`
- CSRF protection validates `X-Requested-With` + origin + `Sec-Fetch-Site`
- API key authentication uses SHA-256 hashing with proper key derivation (HKDF)
- Encryption uses AES-256-GCM with proper IV and auth tag
- Plaintext fallback in `decrypt()` is disabled by default in production
- `validateCsrf` properly skips check for API key auth (no cookies)
- Auth cookie names follow `__Secure-` prefix convention for HTTPS
- `JUDGE_AUTH_TOKEN` validation rejects placeholder values and enforces minimum length
- `AUTH_SECRET` validation enforces minimum length
- Session invalidation via `tokenInvalidatedAt` works correctly
- Rate limiting uses DB time consistently to avoid clock-skew bypasses
- Login rate limiting applies per-IP and per-username keys atomically
- Exponential backoff on repeated rate-limit violations
- Anti-cheat UA hash mismatch is audit-only (no hard reject for legitimate changes)
- File upload validation prevents path traversal via `resolveStoredPath`
- ZIP bomb validation now uses metadata instead of decompression (cycle 24)
