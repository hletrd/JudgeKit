# RPF Cycle 11 — Debugger

**Date:** 2026-04-20
**Base commit:** 74353547

## Findings

### DBG-1: Recruiting token `redeemRecruitingToken` writes timestamps from app clock inside DB transaction [MEDIUM/HIGH]

**File:** `src/lib/assignments/recruiting-invitations.ts:362,373,390,478,485,495,497`
**Description:** The `redeemRecruitingToken` function runs inside `db.transaction()`. The function already calls `getDbNowUncached()` at line 361. However, 7 other timestamp writes in the same transaction use `new Date()`. If the app server clock is 5 seconds behind the DB clock:
1. User redeems at DB time T. The atomic SQL at line 503 validates `expires_at > NOW()` (DB time T).
2. The `enrolledAt` is written as T-5s (app server time).
3. The `redeemedAt` is written as T-5s (app server time).
4. If an admin later queries "when was this enrollment created?" they see T-5s, but the DB's `NOW()` said the enrollment happened at T.

The failure mode is an inconsistent audit trail. The atomic SQL claim prevents any access control bypass — the transaction rolls back if the claim fails. But the timestamp inconsistency could confuse forensic analysis.

**Confidence:** HIGH
**Fix:** Fetch `const dbNow = await getDbNowUncached()` once at the top of the transaction, before the first write, and reuse for all 8 timestamp fields (including the existing one at line 361).

### DBG-2: Password rehash in recruiting path uses `updatedAt: new Date()` [LOW/MEDIUM]

**File:** `src/lib/assignments/recruiting-invitations.ts:390`
**Description:** The bcrypt-to-argon2 transparent rehash at line 390 sets `updatedAt: new Date()`. This is inside the recruiting token transaction. The `updatedAt` value will be app-server time while `tokenInvalidatedAt` at line 361 is DB time. Same clock-skew pattern.
**Confidence:** MEDIUM
**Fix:** Same as DBG-1.
