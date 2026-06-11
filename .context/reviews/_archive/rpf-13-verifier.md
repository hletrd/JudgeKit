# RPF Cycle 13 — Verifier

**Date:** 2026-04-20
**Reviewer:** verifier

---

## V-1: Verify `redeemRecruitingToken` DB-time fix [CONFIRMED]

**File:** `src/lib/assignments/recruiting-invitations.ts:300-544`
**Verification:** The `redeemRecruitingToken` function now fetches `dbNow = await getDbNowUncached()` once at the start of the transaction (line 303) and uses it for all 8 timestamp fields:
- `tokenInvalidatedAt: dbNow` (line 365)
- `updatedAt: dbNow` (lines 367, 377, 394, 501)
- `enrolledAt: dbNow` (line 482)
- `redeemedAt: dbNow` (lines 489, 499)
**Result:** CONFIRMED — all timestamps use `dbNow`. The atomic SQL `NOW()` at line 507 remains the authoritative expiry gate.

## V-2: Verify export `exportedAt` fix [CONFIRMED]

**File:** `src/lib/db/export.ts:65`
**Verification:** `const dbNow = await getDbNowUncached()` is called inside the REPEATABLE READ transaction, then used for `exportedAt` at line 69. The timestamp now matches the snapshot time.
**Result:** CONFIRMED.

## V-3: Verify backup manifest `createdAt` fix [CONFIRMED]

**File:** `src/lib/db/export-with-files.ts:114,166`
**Verification:** `dbNow = await getDbNowUncached()` is fetched once at line 114, then passed to `createBackupIntegrityManifest(dbJson, dbExport, manifestUploads, dbNow)` at line 166. The manifest uses this value at line 47: `createdAt: (dbNow ?? new Date()).toISOString()`.
**Result:** CONFIRMED — but note the fallback `?? new Date()` is dead code since all callers pass `dbNow`. See CR-7.

## V-4: Verify `getContestStatus` requires `now` parameter [CONFIRMED]

**File:** `src/lib/assignments/contests.ts:39-42`
**Verification:** `getContestStatus(contest: ContestEntry, now: Date)` — `now` is required, no default value. The docstring warns against using `new Date()`.
**Result:** CONFIRMED.

## V-5: Verify `selectActiveTimedAssignments` requires `now` parameter [CONFIRMED]

**File:** `src/lib/assignments/active-timed-assignments.ts:21-24`
**Verification:** `selectActiveTimedAssignments(contests, now: Date)` — `now` is required. The async wrapper `getActiveTimedAssignmentsForSidebar()` fetches `getDbNow()` automatically.
**Result:** CONFIRMED.

## V-6: Client-side `new Date()` calls remain — NOT verified as issues [INFO]

**Files:** See CR-1, CR-2, CR-3, CR-4
**Assessment:** These are client-side display issues only. The server correctly validates all time-dependent business logic using DB time. No security or correctness vulnerability.

## Summary

All prior cycle fixes are verified as correctly implemented and intact. The only new findings are client-side display inconsistencies and a minor API design trap in `createBackupIntegrityManifest`.
