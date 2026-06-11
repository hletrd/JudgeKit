# Test Engineer Review — RPF Cycle 21

**Reviewer:** test-engineer
**Date:** 2026-04-24
**Scope:** Full repository test coverage

---

## T-1: [MEDIUM] No test for anti-cheat heartbeat dedup clock-skew behavior

**File:** `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:86-98`
**Confidence:** HIGH

The heartbeat dedup logic in the anti-cheat route uses `Date.now()` (as flagged in CR-1). There is no test that validates the dedup behavior under clock-skew conditions. Adding a test would both verify the fix for CR-1 and prevent regression.

**Fix:** After fixing CR-1 to use DB time, add a unit/integration test that:
1. Inserts a heartbeat with a known `createdAt` timestamp
2. Sends a second heartbeat within 60s (by DB time)
3. Verifies the second heartbeat is correctly deduplicated

---

## T-2: [LOW] No test verifying `ALWAYS_REDACT` and `SANITIZED_COLUMNS` consistency

**File:** `src/lib/db/export.ts:245-260`
**Confidence:** MEDIUM

While the cycle 19 aggregate recommended adding a test that validates `ALWAYS_REDACT` and `SANITIZED_COLUMNS` include entries for known secret columns, I could not find such a test in the test directory. This is a gap: without a test, future developers could add a new secret column without updating the redaction maps, recreating the hcaptchaSecret omission.

**Fix:** Add a test in `tests/unit/db/` that asserts:
1. `ALWAYS_REDACT` includes `passwordHash`, `encryptedKey`, and `hcaptchaSecret`
2. `SANITIZED_COLUMNS` includes all `ALWAYS_REDACT` entries plus session tokens and worker secrets
3. Any column referenced in `REDACT_PATHS` in the logger is also present in `SANITIZED_COLUMNS`

---

## Positive Test Observations

- Comprehensive test suite with unit, integration, component, and e2e tests
- Security tests exist for env validation, IP extraction, rate limiting, and HTML sanitization
- Auth flow tests cover login events, permissions, and rate limiting
