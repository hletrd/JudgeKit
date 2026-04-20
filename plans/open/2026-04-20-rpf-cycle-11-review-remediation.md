# RPF Cycle 11 Review Remediation Plan

**Date:** 2026-04-20
**Source:** `.context/reviews/rpf-11-aggregate.md` and per-agent review files

---

## Scope

This cycle addresses the new rpf-11 findings from the multi-agent review:
- AGG-1: Recruiting token `redeemRecruitingToken` transaction path has 7 `new Date()` writes despite already using `getDbNowUncached()` at line 361
- AGG-2: Export/backup timestamps use `new Date()` instead of DB time
- AGG-3: No test coverage for recruiting token DB-time consistency
- AGG-4: Audit events failure tracker uses `new Date()` for `lastAuditEventWriteFailureAt`

No rpf-11 review finding is silently dropped. No new refactor-only work is added under deferred.

---

## Implementation lanes

### H1: Fix recruiting token `redeemRecruitingToken` transaction path — use DB time for all 7 remaining `new Date()` writes (AGG-1)

- **Source:** AGG-1
- **Severity / confidence:** MEDIUM / HIGH
- **Citations:** `src/lib/assignments/recruiting-invitations.ts:362,373,390,478,485,495,497`
- **Problem:** The `redeemRecruitingToken` function runs inside `db.transaction()` and already calls `getDbNowUncached()` at line 361 for `tokenInvalidatedAt`. However, 7 other timestamp writes in the same transaction use `new Date()`. This is the exact same clock-skew pattern fixed in 20+ other routes. The atomic SQL at line 503 uses `NOW()` for the security-critical expiry validation, so access control is sound, but the audit trail timestamps are inconsistent with DB time. Flagged by 10 of 11 review agents.
- **Plan:**
  1. At the start of the transaction (after entering `db.transaction(async (tx) => {`), add `const dbNow = await getDbNowUncached();`
  2. Replace `updatedAt: new Date()` at line 362 with `updatedAt: dbNow`
  3. Replace `updatedAt: new Date()` at line 373 with `updatedAt: dbNow`
  4. Replace `updatedAt: new Date()` at line 390 with `updatedAt: dbNow`
  5. Replace `enrolledAt: new Date()` at line 478 with `enrolledAt: dbNow`
  6. Replace `redeemedAt: new Date()` at line 485 with `redeemedAt: dbNow`
  7. Replace `redeemedAt: new Date()` at line 495 with `redeemedAt: dbNow`
  8. Replace `updatedAt: new Date()` at line 497 with `updatedAt: dbNow`
  9. Also replace `tokenInvalidatedAt: await getDbNowUncached()` at line 361 with `tokenInvalidatedAt: dbNow` to avoid a redundant DB round-trip (the `dbNow` was already fetched at transaction start)
  10. Add a brief comment noting that all timestamps in the transaction use DB time for consistency with the atomic `NOW()` check
  11. Verify tsc --noEmit passes
  12. Verify existing tests pass
- **Status:** DONE

### M1: Fix export `exportedAt` timestamp to use DB time (AGG-2)

- **Source:** AGG-2
- **Severity / confidence:** LOW / MEDIUM
- **Citations:** `src/lib/db/export.ts:64`
- **Problem:** The streaming export runs inside a REPEATABLE READ transaction for consistent data snapshots, but the `exportedAt` header uses `new Date().toISOString()`. If the app server clock is off, the `exportedAt` won't match the actual snapshot time.
- **Plan:**
  1. At the start of the `start(controller)` callback in `streamDatabaseExport()`, after the transaction begins, fetch `const dbNow = await getDbNowUncached();`
  2. Replace `new Date().toISOString()` at line 64 with `dbNow.toISOString()`
  3. Verify tsc --noEmit passes
  4. Verify existing tests pass
- **Status:** DONE

### M2: Fix backup manifest `createdAt` and backup filename timestamp to use DB time (AGG-2)

- **Source:** AGG-2
- **Severity / confidence:** LOW / MEDIUM
- **Citations:** `src/lib/db/export-with-files.ts:45`, `src/app/api/v1/admin/backup/route.ts:83`
- **Problem:** The backup manifest's `createdAt` and the backup filename timestamp use `new Date()`.
- **Plan:**
  1. In `streamBackupWithFiles()`, fetch DB time once at the start: `const dbNow = await getDbNowUncached();`
  2. Pass `dbNow` to `createBackupIntegrityManifest()` as a parameter
  3. Replace `new Date().toISOString()` in `createBackupIntegrityManifest()` with the passed-in timestamp
  4. In `backup/route.ts`, replace `const timestamp = new Date().toISOString()` with `const timestamp = dbNow.toISOString()` (fetch DB time before the stream starts)
  5. Verify tsc --noEmit passes
  6. Verify existing tests pass
- **Status:** DONE

### L1: Add test for recruiting token DB-time usage (AGG-3)

- **Source:** AGG-3
- **Severity / confidence:** LOW / MEDIUM
- **Citations:** `tests/`
- **Problem:** No unit test verifies that `redeemRecruitingToken` uses DB-sourced time for `enrolledAt`, `redeemedAt`, and `updatedAt` in the transaction path.
- **Plan:**
  1. Extend or create test file for `recruiting-invitations.ts`
  2. Mock `getDbNowUncached` and the raw query
  3. Verify `enrolledAt`, `redeemedAt`, and `updatedAt` use the DB-sourced time value
- **Status:** DONE

---

## Deferred items

### DEFER-1: Make `withUpdatedAt()` `now` parameter required or auto-use DB time (AGG-2, carried from rpf-10 DEFER-1)

- **Source:** AGG-2 (rpf-10), carried forward
- **Severity / confidence:** LOW / MEDIUM
- **Citations:** `src/lib/db/helpers.ts:20`
- **Original severity preserved:** LOW / MEDIUM
- **Reason for deferral:** Making `now` required would require updating all ~30+ call sites across the codebase in a single batch change. Making it internally call `getDbNowUncached()` would require making the function async, also updating all call sites. Both approaches are significant refactors that could introduce regressions. The immediate fix (H1) addresses the most impactful call sites. The docstring already warns about the default behavior. This is an architectural improvement that should be done in a dedicated cycle.
- **Exit criterion:** When a new clock-skew instance is introduced via `withUpdatedAt()` without `now`, or when a dedicated refactoring cycle is scheduled for the helpers module.

### DEFER-2: Audit events failure tracker `new Date()` for `lastAuditEventWriteFailureAt` (AGG-4)

- **Source:** AGG-4
- **Severity / confidence:** LOW / LOW
- **Citations:** `src/lib/audit/events.ts:117`
- **Original severity preserved:** LOW / LOW
- **Reason for deferral:** The `lastAuditEventWriteFailureAt` field is used purely for health monitoring / diagnostic output. It is not used for any comparison, access control, or data integrity check. Replacing it with `getDbNowUncached()` would require making the `flushAuditBuffer` function aware of async DB calls, adding complexity to the already-tricky audit buffer flush path for negligible benefit.
- **Exit criterion:** When the audit events module is next refactored, or when a developer reports that the diagnostic timestamp is causing confusion in production monitoring.

### DEFER-3: Recruiting token flow `new Date()` for enrollment/redemption timestamps (carried from rpf-10 DEFER-2) — RESOLVED

- **Source:** AGG-4 (rpf-9), carried forward
- **Note:** This deferred item is NOW RESOLVED by H1 in this cycle. All 7 `new Date()` calls in the `redeemRecruitingToken` transaction have been replaced with `dbNow` fetched via `getDbNowUncached()`.
- **Original severity preserved:** LOW / MEDIUM
- **Exit criterion:** MET — H1 implementation complete and verified.

---

## Carried Deferred Items (from Prior Cycles)

All other deferred items D1-D17 from prior cycle remediation plans remain unchanged. See archived plan files for the full deferred list.

---

## Progress log

- 2026-04-20: Plan created from rpf-11 aggregate review.
- 2026-04-20: H1 DONE — recruiting-invitations.ts: replaced 7 `new Date()` + 1 redundant `getDbNowUncached()` with single `dbNow` variable fetched at transaction start. Commit 4f4f282c.
- 2026-04-20: M1 DONE — export.ts: replaced `new Date().toISOString()` with `getDbNowUncached()` for `exportedAt` header. Commit 609e833e.
- 2026-04-20: M2 DONE — export-with-files.ts + backup/route.ts: replaced `new Date()` with `getDbNowUncached()` for manifest `createdAt` and backup filename timestamp. Commit baae3771.
- 2026-04-20: L1 DONE — added 2 tests for recruiting token DB-time usage. Commit aff27bab.
- 2026-04-20: Test mock fix for export-with-files test. Commit f932094f.
- 2026-04-20: All gates green (eslint, tsc, vitest 291/2047, next build).
