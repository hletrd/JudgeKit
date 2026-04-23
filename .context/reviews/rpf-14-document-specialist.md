# RPF Cycle 14 - Document Specialist

**Date:** 2026-04-20
**Base commit:** c39ded3b

## Findings

### DOC-1: `withUpdatedAt()` JSDoc acknowledges `new Date()` default but doesn't flag it as deprecated [LOW/MEDIUM]

**File:** `src/lib/db/helpers.ts:8-9`

**Description:** The JSDoc for `withUpdatedAt()` documents that it "By default, uses `new Date()` (app server clock)" and that callers "can pass it as the second argument to keep timestamps consistent with the DB-time migration." However, it doesn't indicate that the `new Date()` default is a known anti-pattern that should be avoided. Given that the codebase has explicitly removed `new Date()` defaults from other helpers (`getContestStatus`, `createBackupIntegrityManifest`, `selectActiveTimedAssignments`), this JSDoc should reflect the current best practice.

**Fix:** Update JSDoc to mark the default as deprecated, or (better) make the parameter required.

**Confidence:** High

### DOC-2: `db-time.ts` module comment is excellent but could mention creation patterns [LOW/LOW]

**File:** `src/lib/db-time.ts:5-10`

**Description:** The `getDbNow()` module comment clearly states "Use this instead of `new Date()` for temporal comparisons (expiry, deadline) in server components and API routes." However, it only mentions *comparisons*, not *creation*. The current cycle's findings show that the creation path (storing `expiresAt`) is equally important. The comment could be expanded to mention that absolute timestamps for storage should also use DB time.

**Fix:** Add a note: "For storing absolute timestamps (e.g., expiresAt), compute them server-side using DB time rather than accepting client-computed values."

**Confidence:** Low
