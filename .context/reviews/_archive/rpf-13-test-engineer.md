# RPF Cycle 13 — Test Engineer

**Date:** 2026-04-20
**Reviewer:** test-engineer

---

## TE-1: No test for client-side expiry badge behavior [LOW/MEDIUM]

**File:** `src/components/contest/recruiting-invitations-panel.tsx:248`
**Problem:** The `getStatusBadge()` function uses `new Date()` to determine if an invitation is expired. There is no component test verifying that:
1. An invitation with `expiresAt` in the past shows "Expired" badge
2. An invitation with `expiresAt` in the future shows "Pending" badge
3. The badge correctly handles edge cases (same-day expiry, null expiry)
**Fix:** Add a component test for `getStatusBadge()` with mocked dates. Alternatively, if the fix from CR-1 is applied (server-provided `isExpired`), the test should verify the server-provided field is rendered correctly.
**Confidence:** MEDIUM

## TE-2: No test for API key expiry badge behavior [LOW/MEDIUM]

**File:** `src/app/(dashboard)/dashboard/admin/api-keys/api-keys-client.tsx:270`
**Problem:** Same as TE-1. The `getStatus()` function uses `new Date()` for the expired check. No component test covers this.
**Fix:** Add a component test for `getStatus()` with mocked dates.
**Confidence:** MEDIUM

## TE-3: Test coverage for recruiting token DB-time fix is present [CONFIRMED]

**File:** `tests/unit/assignments/recruiting-token-db-time.test.ts`
**Verification:** The test file exists and was added in the previous cycle. It mocks `getDbNowUncached` and verifies that all written timestamps in the recruiting token path use the DB-sourced time value.
**Result:** CONFIRMED — test coverage is adequate.

## TE-4: Test coverage for export DB-time fix is present [CONFIRMED]

**File:** `tests/unit/db/export-with-files.test.ts`
**Verification:** The test file includes a mock for `getDbNowUncached`.
**Result:** CONFIRMED.

## Summary

The DB-time fix tests from the previous cycle are verified as present. New test gaps are limited to client-side component tests for expiry badge behavior, which are low priority since the server is the authoritative gate.
