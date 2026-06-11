# Cycle 24 Test Engineering Review

**Date:** 2026-05-09
**HEAD:** c86576a1
**Scope:** Test coverage, flaky tests, TDD opportunities

---

## New Findings

### TE-1: [MEDIUM] Missing test for export redaction with overlapping table keys

**Files:** `tests/unit/db/export-sanitization.test.ts`
**Confidence:** HIGH

The export sanitization tests verify that individual columns are redacted, but there is no test for the case where a table exists in both `EXPORT_SANITIZED_COLUMNS` and `EXPORT_ALWAYS_REDACT_COLUMNS` with different column sets. This is the exact scenario described in CR-1.

**Fix:** Add a test that verifies the merged redaction map includes ALL columns from both sources for tables present in both objects.

---

### TE-2: [LOW] Missing migration test for contestAccessTokens.expiresAt

**Files:** `drizzle/pg/0022_contest_access_token_expiry.sql`
**Confidence:** MEDIUM

There is no test verifying that the migration runs correctly and that existing tokens receive appropriate `expires_at` values. Without a data migration for existing tokens, they have NULL expires_at and grant indefinite access.

**Fix:** Add an integration test that verifies:
1. The migration adds the column
2. New tokens receive expires_at from assignment deadline
3. Existing tokens with NULL expires_at are handled correctly

---

### TE-3: [LOW] Missing index verification test for contestAccessTokens

**Files:** `src/lib/db/schema.pg.ts`
**Confidence:** LOW

No test verifies the presence of the expected indexes on `contest_access_tokens`. If someone removes or changes the index definition, performance regressions could go undetected.

**Fix:** Add a schema-validation test that checks index existence, similar to the cycle-23 remediation tests that verify SQL structure.

---

## Areas Verified (No Issues Found)

- Component tests exist for ResourceUsageBar (16 tests)
- Component tests exist for useKeyboardShortcuts
- Component tests exist for locale-switcher
- Source-grep tests verify cycle-23 fixes
- Leaderboard live-rank logic has structure-verification tests
- Logger tests verify redaction behavior
- Export sanitization tests verify redaction of all secret columns
- All 314 test files pass (2352 tests + 189 component tests)
