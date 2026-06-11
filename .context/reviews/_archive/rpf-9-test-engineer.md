# RPF Cycle 9 Test Engineer Review

**Date:** 2026-04-20
**Base commit:** c30662f0

## Findings

### TE-1: No test verifying CSS letter-spacing respects Korean locale [MEDIUM/HIGH]

**Files:** `src/app/globals.css:129,213`
**Description:** There is no test that verifies the Korean letter-spacing rule from CLAUDE.md is respected at the CSS level. The i18n keys test exists but only checks translation keys, not CSS behavior. A visual regression or CSS assertion test would catch this violation.
**Fix:** Add a test that checks `globals.css` does not apply letter-spacing to `:lang(ko)` elements.

### TE-2: No test for `api-key-auth.ts` `lastUsedAt` time source [LOW/MEDIUM]

**Files:** `src/lib/api/api-key-auth.ts:103`
**Description:** The API key authentication test (`tests/unit/api/api-keys.route.test.ts`) mocks `getDbNowUncached` but does not verify that `lastUsedAt` uses the DB time source instead of `new Date()`.
**Fix:** Add a mock assertion that `lastUsedAt` equals the DB-now value, not `Date.now()`.

### TE-3: No test for server action `updatedAt` time source [LOW/LOW]

**Files:** Server action test files
**Description:** Server action tests do not verify that `updatedAt` uses `getDbNowUncached()` instead of `new Date()`.
**Fix:** Add mock assertions for `getDbNowUncached` in server action tests.
