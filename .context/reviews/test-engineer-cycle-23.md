# Test Engineer — Cycle 23

**Date:** 2026-04-24
**Scope:** Test coverage and quality review

---

## T-1: [MEDIUM] Zero test coverage for `importDatabase` — schema drift silently corrupts data

**Confidence:** HIGH
**Citations:** `src/lib/db/import.ts:99-203`

The `importDatabase` function has no unit or integration tests. It performs critical operations (truncate all tables, bulk insert) with column-name-by-position mapping that is vulnerable to schema drift (CR-3). A test should verify that imported data is correctly mapped to the target schema.

**Concrete failure scenario:** A schema migration renames or reorders columns. The import function maps data by position, silently corrupting data. No test catches this.

**Fix:** Add at minimum: (1) a test that imports a known export and verifies the data matches, (2) a test that verifies column-name validation when column order differs between export and target.

---

## T-2: [LOW] No test for SSE connection tracking eviction logic

**Confidence:** MEDIUM
**Citations:** `src/app/api/v1/submissions/[id]/events/route.ts:39-58`

The `addConnection`/`removeConnection` functions have complex invariants (tracking map size, user counts, oldest-entry eviction). There are no unit tests for this logic.

**Fix:** Extract the connection tracking into a testable class/module and add unit tests for: add/remove, eviction, per-user count accuracy.

---

## T-3: [LOW] No test for `sanitizeSubmissionForViewer` hidden DB query path

**Confidence:** LOW
**Citations:** `src/lib/submissions/visibility.ts:90-99`

When `assignmentVisibility` is not provided, the function queries the DB. There are no tests for the "with assignmentVisibility" vs "without assignmentVisibility" code paths.

**Fix:** Add tests for both paths.

---

## Summary

- Total findings: 3
- MEDIUM: 1 (T-1)
- LOW: 2 (T-2, T-3)
