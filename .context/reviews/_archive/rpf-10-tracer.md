# Cycle 10 Tracer Review

**Date:** 2026-04-20
**Reviewer:** tracer
**Base commit:** fae77858

## Findings

### TR-1: Access code redemption — causal trace shows mixed time sources [MEDIUM/HIGH]

**Files:** `src/lib/assignments/access-codes.ts:130-189`
**Description:** Tracing the `redeemAccessCode` flow:
1. Line 130: `rawQueryOne("SELECT NOW()")` — fetches DB time
2. Line 134: `const now = nowRow.now` — DB time stored in `now`
3. Line 136: `effectiveClose < now` — deadline check uses DB time (correct)
4. Line 170: `enrolledAt: new Date()` — writes app server time (inconsistent!)
5. Line 189: `redeemedAt: new Date()` — writes app server time (inconsistent!)

The `now` variable is in scope and should be used for steps 4 and 5. This is a straightforward missed fix during the cycles 7-9 migration.
**Fix:** Replace `new Date()` with `now` at lines 170 and 189.
**Confidence:** High

### TR-2: `withUpdatedAt()` call chain produces `new Date()` timestamps in `access-codes.ts` [LOW/MEDIUM]

**Files:** `src/lib/assignments/access-codes.ts:33,69` -> `src/lib/db/helpers.ts:20`
**Description:** Tracing `setAccessCode` and `revokeAccessCode`:
1. Line 33: `withUpdatedAt({ accessCode })` — no `now` argument
2. Helpers.ts line 20: `updatedAt: now ?? new Date()` — defaults to `new Date()`

These calls produce app-server-time `updatedAt` timestamps. The same pattern exists in `revokeAccessCode` at line 69.
**Fix:** Fetch DB time and pass to `withUpdatedAt()`.
**Confidence:** High

## Verified Safe

- No circular dependency chains detected.
- Transaction boundaries are correct.
- Error propagation paths are clean.
