# RPF Cycle 15 — Performance Reviewer

**Date:** 2026-04-20
**Base commit:** f0bef9cb

## Findings

### PERF-1: Duplicate `getDbNowUncached()` in recruiting invitations POST (same as CR-1) [LOW/MEDIUM]

**File:** `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/route.ts:70,77`

The `expiryDays` and `expiryDate` branches each call `getDbNowUncached()` independently, meaning two `SELECT NOW()` round-trips in the same request. While the branches are mutually exclusive, fetching `dbNow` once before the branch would save one DB round-trip per invitation creation request.

**Fix:** Fetch `dbNow` once before the if/else block.

**Confidence:** MEDIUM

### PERF-2: `streamBackupWithFiles` buffers entire export in memory (carry from rpf-13, rpf-14) [MEDIUM/HIGH]

**File:** `src/lib/db/export-with-files.ts:120-131`

Carry-over from rpf-13 AGG-6 / rpf-14 AGG-6. The backup-with-files path collects the entire database export JSON into memory before creating the ZIP. The short-term mitigation (warning log for large exports) has not been implemented yet.

**Fix:** Short-term: add a warning log when the export exceeds a threshold. Long-term: migrate to a streaming ZIP library.

**Confidence:** HIGH (previously confirmed)

### PERF-3: `getDbNowUncached()` called multiple times within single transactions [LOW/LOW]

**Files:** Multiple API routes

Several routes call `getDbNowUncached()` multiple times within the same request (e.g., `src/app/api/v1/users/[id]/route.ts:328,362` where `dbNow` is fetched once and `getDbNowUncached()` is also called inline in `withUpdatedAt`). However, since the rpf-14 fix (H2) made `now` required in `withUpdatedAt`, these are now explicit `await getDbNowUncached()` calls that could be consolidated. The overhead is minor (each call is one `SELECT NOW()`), but it's unnecessary when the value would be the same within a few milliseconds.

**Fix:** Low priority. Consider caching `getDbNowUncached()` result at the request level in the future.

**Confidence:** LOW

## Verified Safe

- Backup pipeline passes `dbNow` from route handler through `streamBackupWithFiles` to `streamDatabaseExport`, eliminating 2 redundant `SELECT NOW()` calls — verified.
- `streamDatabaseExport` accepts optional `dbNow` parameter — verified.
- Auth cache in proxy uses FIFO eviction with configurable TTL and max size — verified.
