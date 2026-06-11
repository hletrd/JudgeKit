# RPF Cycle 15 — Document Specialist

**Date:** 2026-04-20
**Base commit:** f0bef9cb

## Findings

### DOC-1: `streamBackupWithFiles` JSDoc does not document `dbNow` parameter [LOW/LOW]

**File:** `src/lib/db/export-with-files.ts:112`

The function signature is `streamBackupWithFiles(signal?: AbortSignal, dbNow?: Date)` but the JSDoc comment (lines 107-111) only documents `signal`. The `dbNow` parameter was added in rpf-13 but the JSDoc was not updated.

**Fix:** Add `@param dbNow` to the JSDoc.

**Confidence:** LOW

### DOC-2: Workspace-to-public migration plan status markers are stale for some items [LOW/LOW]

**File:** `plans/open/2026-04-19-workspace-to-public-migration.md`

The plan states "Phase 4 IN PROGRESS (cycle 23)" in the status line, but the plan was last updated during cycle 14. Cycle 23 work (control route merge) is marked as DONE within the document. The top-level status line should reflect the current state more accurately.

**Fix:** Update the status line to reflect the current state.

**Confidence:** LOW

## Verified Safe

- `withUpdatedAt()` JSDoc updated to reflect required `now` parameter — verified.
- `getDbNow` / `getDbNowUncached` JSDoc accurate — verified.
- `createBackupIntegrityManifest` JSDoc documents `dbNow` — verified.
