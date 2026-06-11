# RPF Cycle 13 — Performance Reviewer

**Date:** 2026-04-20
**Reviewer:** perf-reviewer

---

## PERF-1: Double DB time fetch in backup route [LOW/MEDIUM]

**File:** `src/app/api/v1/admin/backup/route.ts:85` + `src/lib/db/export-with-files.ts:114`
**Problem:** The backup route fetches `getDbNowUncached()` at line 85 for the filename, then `streamBackupWithFiles()` fetches `getDbNowUncached()` again at line 114 for the manifest. Similarly, `streamDatabaseExport()` also calls `getDbNowUncached()` internally at line 65. This means the backup-with-files path makes 3 separate `SELECT NOW()` queries (one in the route, one in `streamBackupWithFiles`, one inside `streamDatabaseExport`). Each is a lightweight query, but they're unnecessary round-trips.
**Fix:** Pass `dbNow` from the route handler into `streamBackupWithFiles()`, which should pass it through to `createBackupIntegrityManifest()` (already accepts it) and into `streamDatabaseExport()`. This eliminates 2 extra DB round-trips per backup.
**Confidence:** MEDIUM

## PERF-2: Export stream collects all data in memory before streaming backup-with-files [MEDIUM/HIGH]

**File:** `src/lib/db/export-with-files.ts:118-131`
**Problem:** `streamBackupWithFiles()` first collects the entire database export JSON into memory (lines 118-131: reads the full `streamDatabaseExport()` stream into `dbChunks`, concatenates, parses), then adds file uploads, generates the ZIP in memory, and only then streams the result. For a large database, this means the entire JSON export is held in memory at once, plus the ZIP buffer. This could cause OOM on large datasets.
**Fix:** This is an architectural limitation of the current JSZip approach. A proper fix would use a streaming ZIP library (e.g., `archiver` with streaming) that can write entries without buffering the entire archive. This is a significant refactor. For now, documenting the memory characteristics for operators is the pragmatic approach.
**Confidence:** HIGH — this is a real concern for large installations, but the fix is architectural.

## PERF-3: `waitForReadableStreamDemand` busy-polls with 50ms intervals [LOW/LOW]

**File:** `src/lib/db/export.ts:36-43`
**Problem:** When backpressure is applied (`desiredSize <= 0`), the export stream polls every 50ms. This is acceptable for a server-side stream but wastes a small amount of CPU during sustained backpressure.
**Fix:** Very low priority. Could use a more efficient signal (e.g., `transformStream` with proper backpressure handling), but the 50ms polling is pragmatic and functional.
**Confidence:** LOW

## Verified Safe

- Server components use `getDbNow()` with React.cache() for automatic dedup per request.
- `selectActiveTimedAssignments()` is synchronous (no DB call) — correct design.
- Contest queries use indexed columns for lookups.
