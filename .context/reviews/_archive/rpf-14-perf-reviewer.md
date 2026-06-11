# RPF Cycle 14 - Performance Reviewer

**Date:** 2026-04-20
**Base commit:** c39ded3b

## Findings

### PERF-1: `streamBackupWithFiles` buffers entire database export in memory [MEDIUM/HIGH]

**File:** `src/lib/db/export-with-files.ts:120-131`

**Description:** The backup-with-files path collects the entire database export JSON into memory (lines 120-131) before creating the ZIP. For large databases, this means the entire JSON export + all file buffers + the ZIP buffer are held simultaneously. The code collects `dbChunks` into an array, then `Buffer.concat`s them, then `JSON.parse`s the result, then passes it to JSZip. At peak, memory usage is roughly: raw_stream_chunks + combined_json_string + parsed_js_object + zip_buffer, which for a 100MB export could be ~400MB+.

This is a known issue from prior cycles (AGG-6 in rpf-13). The short-term mitigation of documenting the memory characteristics and adding a warning log has not been implemented yet.

**Fix:** Short-term: add a warning log when the export exceeds a threshold (e.g., 50MB). Long-term: migrate to a streaming ZIP library like `archiver`.

**Confidence:** High (confirmed by prior cycles)

### PERF-2: `getDbNowUncached()` called twice in backup route when `includeFiles=false` [LOW/LOW]

**File:** `src/app/api/v1/admin/backup/route.ts:85-116`

**Description:** When `includeFiles=false`, the backup route calls `getDbNowUncached()` once at line 85 for the filename, then passes it to `streamDatabaseExport()`. This is correct - no duplicate call. However, the export route (`migrate/export/route.ts:83`) also correctly passes `dbNow` through. The prior cycle's fix (AGG-5) was properly implemented.

**Status:** No issue - verified correct.

### PERF-3: Submissions page executes redundant distinct-language query [LOW/LOW]

**File:** `src/app/(public)/submissions/page.tsx:156-162`

**Description:** The submissions page runs a `selectDistinct` query for available languages before the main submissions query. This is an extra DB round-trip on every page load. Could be optimized with caching or by extracting languages from the main query results, but the performance impact is minimal since the table is indexed.

**Fix:** Consider caching available languages or extracting from main query. Low priority.

**Confidence:** Low

## Verified Safe

- Backup pipeline: `dbNow` passed through to eliminate redundant `SELECT NOW()` calls - verified.
- `streamDatabaseExport`: uses backpressure-aware `waitForReadableStreamDemand` - verified.
- Export chunk size (1000 rows) is reasonable for streaming - verified.
- Concurrency limiter for Docker container spawning uses `pLimit` - verified.
