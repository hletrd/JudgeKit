# Cycle 10 Debugger Review

**Date:** 2026-04-20
**Reviewer:** debugger
**Base commit:** fae77858

## Findings

### DBG-1: Access code redemption uses two time sources in one transaction — latent inconsistency [MEDIUM/HIGH]

**Files:** `src/lib/assignments/access-codes.ts:130-134,170,189`
**Description:** The `redeemAccessCode` transaction: (1) fetches DB time via `SELECT NOW()` for deadline check, (2) uses `new Date()` for `enrolledAt` and `redeemedAt` writes. If the clocks diverge, the audit trail shows the enrollment happened at a different time than the deadline check. This is a latent bug that only manifests under clock skew.
**Concrete failure scenario:** App server clock is 5 seconds behind DB. A user redeems at DB time T. The deadline check passes (DB says T < deadline). But `redeemedAt` is recorded as T-5s. An audit query comparing `redeemedAt` with the deadline shows the redemption happened before the deadline, which is misleading.
**Fix:** Use `now` variable (already fetched at line 134) for both `enrolledAt` and `redeemedAt`.
**Confidence:** High

### DBG-2: `recruiting-invitations.ts` `updateRecruitingInvitation` uses `new Date()` for `updatedAt` [LOW/LOW]

**Files:** `src/lib/assignments/recruiting-invitations.ts:194,244,252`
**Description:** Invitation update and password reset write `updatedAt: new Date()`. Low impact since these are metadata-only timestamps.
**Fix:** Use `getDbNowUncached()`.
**Confidence:** Low

## Verified Safe

- No null pointer risks detected.
- Error handling is comprehensive with proper error types.
- Transaction rollback patterns are correct.
- No unhandled promise rejections.
