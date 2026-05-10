# Code Reviewer — Cycle 29

**Date:** 2026-05-09
**Cycle:** 29 of 100
**Base commit:** 81c5daa8
**Current HEAD:** 81c5daa8 (clean working tree)

---

## New Findings

### C29-CR-1: Recruiting token regex lacks upper bound — DoS vector

- **File:** `src/lib/auth/config.ts:208`
- **Severity:** Medium
- **Confidence:** High
- **Summary:** The regex `/^[-A-Za-z0-9_]{16,}$/` validates recruiting token format before rate-limit consumption. It has a lower bound of 16 but no upper bound. An attacker can send an arbitrarily long token (e.g., 10MB) causing memory pressure and potential ReDoS before rejection. The token is also used in `recordLoginEvent` attemptedIdentifier.
- **Fix:** Add upper bound: `/^[-A-Za-z0-9_]{16,128}$/`.

### C29-CR-2: Test infrastructure failure — DATABASE_URL required

- **File:** `tests/unit/db/export-sanitization.test.ts`
- **Severity:** Low
- **Confidence:** High
- **Summary:** Test fails with `DATABASE_URL is required` when run without environment variables. The test imports db-dependent modules at top level rather than mocking them.
- **Fix:** Mock the db module or configure test DATABASE_URL in vitest config.

### C29-CR-3: `startRateLimitEviction` race condition

- **File:** `src/lib/security/rate-limit.ts:70-81`
- **Severity:** Low
- **Confidence:** Low
- **Summary:** Two concurrent calls could both pass `if (evictionTimer) return` before either assigns, creating duplicate timers. Theoretical in Node.js module scope but worth guarding.
- **Fix:** Use a once-flag or atomic initialization pattern.

---

## Carry-Forward Findings (no change at HEAD)

### C27-CR-1: Stale Docker image detection silently skipped
- **File:** `src/app/api/v1/admin/docker/images/route.ts:30`
- **Status:** Still present. `info.Created as string` lacks runtime validation.

### C27-CR-2: Prompt sanitization regex misses empty injection markers
- **File:** `src/lib/judge/prompt-sanitization.ts:12`
- **Status:** Still present. `<<>>` not matched.

### C27-CR-3: DELETE handler audit gap
- **File:** `src/app/api/v1/admin/docker/images/route.ts:129-135`
- **Status:** Still present. No audit event for rejected DELETE.

---

## Prior Fixes Verified at HEAD

| Finding | Status | Evidence |
|---------|--------|----------|
| C28-1 localStorage try/catch | FIXED | compiler-client.tsx:186, submission-detail-client.tsx:94 |
| C28-2 localStorage try/catch | FIXED | Both files now wrapped |
| C26-1 LLM prompt sanitization | FIXED | sanitizePromptInput active |
| C25-1 Trusted registry boundary | FIXED | docker-image-validation.ts |
