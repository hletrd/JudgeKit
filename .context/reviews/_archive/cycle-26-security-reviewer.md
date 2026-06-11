# Cycle 26 Security Review

**Date:** 2026-04-20
**Base commit:** 660ae372

---

## SEC-1: Flaky test reveals potential mock isolation gap in recruit page tests [MEDIUM/MEDIUM]

**Files:** `tests/unit/recruit-page-metadata.test.ts:42`
**Description:** The test that times out suggests the mock for `getRecruitingInvitationByToken` may not be properly isolating the module under test. If the test were to pass intermittently (e.g. on a faster machine), it could mask a scenario where the real DB query runs instead of the mock — potentially leaking real invitation data in a test environment. The root cause is the use of dynamic `import()` which re-executes module-level code and may not respect Vitest's mock hoisting consistently.
**Concrete failure scenario:** On a machine where the test passes, a misconfigured mock could allow the real `getRecruitingInvitationByToken` to execute, potentially exposing real candidate data in test logs.
**Fix:** Refactor the test to use static imports and proper `vi.mock` setup, or increase the timeout and verify mock isolation.

## SEC-2: No new security issues found in current codebase state [VERIFIED SAFE]

**Verified items:**
- Auth config uses Argon2id with timing-safe dummy hash for user enumeration prevention.
- Password rehashing from bcrypt to Argon2id is properly implemented and error-handled.
- Rate limiting has two-tier strategy (sidecar + PostgreSQL with SELECT FOR UPDATE) preventing TOCTOU races.
- Recruiting token flow uses atomic SQL transactions for claim validation, preventing double-redeem.
- Token hashes (SHA-256) are stored instead of plaintext tokens.
- Session invalidation via `tokenInvalidatedAt` is properly checked in JWT callback.
- `dangerouslySetInnerHTML` is always sanitized via `sanitizeHtml()` or `safeJsonForScript()`.
- No `process.env` values are exposed to the client without `NEXT_PUBLIC_` prefix.
- CSRF protection is in place for server actions.
- API key auth is properly implemented with constant-time comparison.
