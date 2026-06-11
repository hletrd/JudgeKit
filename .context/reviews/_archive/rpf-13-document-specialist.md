# RPF Cycle 13 — Document Specialist

**Date:** 2026-04-20
**Reviewer:** document-specialist

---

## DOC-1: `createBackupIntegrityManifest` parameter not documented as required [LOW/LOW]

**File:** `src/lib/db/export-with-files.ts:38-56`
**Problem:** The `dbNow` parameter is optional (`dbNow?: Date`) but there is no JSDoc explaining when it should be provided. All callers currently pass it, but a future developer might not realize the importance.
**Fix:** If `dbNow` is made required (as suggested in ARCH-1), this resolves itself. Otherwise, add a JSDoc `@param` noting that callers should always pass DB time.
**Confidence:** LOW

## DOC-2: `withUpdatedAt()` docstring is adequate [CONFIRMED]

**File:** `src/lib/db/helpers.ts:1-21`
**Verification:** The docstring clearly explains:
- The default uses `new Date()` (app server clock)
- For DB-time consistency, pass `getDbNowUncached()` as the second argument
- Includes usage examples
**Result:** CONFIRMED — documentation matches behavior.

## DOC-3: `getDbNow()` and `getDbNowUncached()` documentation is adequate [CONFIRMED]

**File:** `src/lib/db-time.ts:1-39`
**Verification:** Both functions have clear JSDoc explaining:
- Purpose (avoid clock skew)
- When to use each variant (React vs. non-React context)
- That they throw rather than falling back to app-server time
**Result:** CONFIRMED.

## DOC-4: `getContestStatus()` docstring warns about `new Date()` [CONFIRMED]

**File:** `src/lib/assignments/contests.ts:32-38`
**Verification:** The IMPORTANT note in the JSDoc warns developers to use `getDbNow()` and not `new Date()`.
**Result:** CONFIRMED.
