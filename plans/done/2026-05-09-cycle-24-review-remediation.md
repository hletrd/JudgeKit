# Cycle 24 Review Remediation Plan

**Date:** 2026-05-09
**Based on:** `.context/reviews/_aggregate-cycle-24.md`
**HEAD:** c86576a1

---

## Active Tasks

### C24-1: Add database index on contestAccessTokens.expiresAt

- **File:** `src/lib/db/schema.pg.ts`
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **Cross-agent agreement:** security-reviewer, perf-reviewer, critic

**Problem:**
The new `expires_at` column on `contest_access_tokens` is queried in 10+ locations but has no index. Queries with `(expires_at IS NULL OR expires_at > NOW())` will perform full table scans.

**Fix:**
Add a composite index on `(assignment_id, user_id, expires_at)` in the Drizzle schema, then generate and run the migration.

**Implementation:**
- [x] Add index to `contestAccessTokens` table definition in `schema.pg.ts`
- [x] Create migration `0023_contest_access_token_index.sql`
- [x] Verify migration SQL is correct
- [x] Update journal JSON

**Status:** Completed in commit 02296136.

---

### C24-2: Fix export redaction map merge to use explicit Set union

- **File:** `src/lib/db/export.ts`
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **Cross-agent agreement:** code-reviewer, perf-reviewer, critic

**Problem:**
The object spread `{ ...EXPORT_SANITIZED_COLUMNS, ...EXPORT_ALWAYS_REDACT_COLUMNS }` causes the ALWAYS Set to overwrite the SANITIZED Set for overlapping tables. Future additions to SANITIZED-only columns will be silently dropped.

**Fix:**
Replace the spread with an explicit merge function that unions the Sets per table.

**Implementation:**
- [x] Add `mergeRedactionMaps` helper function in `export.ts`
- [x] Replace the spread at line 78 with the helper
- [x] Verify export tests still pass

**Status:** Completed in commit ee475bf9.

---

### C24-3: Add data migration for existing contest access tokens

- **File:** New migration file in `drizzle/pg/`
- **Severity:** LOW
- **Confidence:** MEDIUM
- **Cross-agent agreement:** security-reviewer, critic

**Problem:**
Existing tokens have `NULL expires_at`, which the query logic treats as "never expires". This grants indefinite access to contest resources for tokens created before the migration.

**Fix:**
Add a data migration that sets `expires_at` for existing tokens based on their assignment's deadline.

**Implementation:**
- [x] Create migration SQL: UPDATE contest_access_tokens SET expires_at = assignments.deadline WHERE expires_at IS NULL
- [x] Handle orphaned tokens (assignment no longer exists) — set to a past date (1970-01-01)
- [x] Migration tested (SQL syntax verified)

**Status:** Completed in commit 02296136 (combined with C24-1 migration).

---

### C24-4: Add test for export redaction map merge behavior

- **File:** `tests/unit/db/export-sanitization.test.ts`
- **Severity:** LOW
- **Confidence:** HIGH
- **Cross-agent agreement:** test-engineer

**Problem:**
No test verifies that the merged redaction map includes all columns when a table exists in both maps with different column sets.

**Fix:**
Add a unit test that creates divergent column sets and asserts the union.

**Implementation:**
- [x] Add test case for merged redaction map with overlapping tables
- [x] Verify the test catches the spread bug (if reverted)
- [x] Run tests — 17 tests pass

**Status:** Completed in commit ee475bf9.

---

## Deferred Items

### DEFER-C24-1: Extract shared SQL fragment for contest access token expiry check

- **File+line:** `src/lib/assignments/contests.ts:183`, `src/lib/platform-mode-context.ts:88-143`, `src/app/api/v1/contests/[assignmentId]/*/route.ts` (5 files)
- **Severity:** LOW
- **Confidence:** MEDIUM
- **Original finding:** AGG-4 / A-2
- **Reason for deferral:** Maintainability refactor, not a security/correctness/data-loss issue. The duplicated SQL fragment is small and stable. The codebase uses raw SQL extensively; extracting a shared fragment is a style improvement.
- **Exit criterion:** Either (a) the expiry logic needs to change (e.g., add grace period), or (b) a dedicated API-handler refactor cycle opens.

---

## Gate Results

- [x] `npx eslint .` passes
- [x] `npx tsc --noEmit` passes
- [x] `npx next build` passes
- [x] `npx vitest run` passes — 314 test files, 2358 tests
- [x] `npx vitest run --config vitest.config.component.ts` passes — 68 test files, 208 tests

---

## Implementation Order

1. C24-2 (Export merge fix) — code change, add test
2. C24-4 (Export merge test) — validate C24-2
3. C24-1 (Add index) — schema change, needs migration
4. C24-3 (Data migration) — depends on C24-1 migration infrastructure

---

## Deploy Results

Deployed to both servers at 2026-05-09 12:04 UTC.

**worv (test.worv.ai):**
- App image built and started successfully
- Database migrated without issues
- All containers healthy
- Nginx configured and reloaded

**algo (algo.xylolabs.com):**
- App image built and started successfully
- Database migrated without issues (drizzle-kit push ran)
- All containers healthy
- Nginx configured and reloaded
- Health check returned HTTP 200
- HTTPS endpoint verified
- Judge worker stopped per INCLUDE_WORKER=false (dedicated worker-0 handles judging)
