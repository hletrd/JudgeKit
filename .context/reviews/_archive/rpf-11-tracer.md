# RPF Cycle 11 — Tracer

**Date:** 2026-04-20
**Base commit:** 74353547

## Findings

### TR-1: Recruiting token flow: tracing the clock-skew impact through the data flow [MEDIUM/HIGH]

**File:** `src/lib/assignments/recruiting-invitations.ts`
**Trace:**
1. User submits recruiting token + password to `redeemRecruitingToken()`.
2. Function enters `db.transaction()`.
3. Line 361: `tokenInvalidatedAt: await getDbNowUncached()` — uses DB time (correct).
4. Line 362: `updatedAt: new Date()` — uses app time (inconsistent with step 3).
5. Line 373: `updatedAt: new Date()` — uses app time (inconsistent).
6. Line 390: `updatedAt: new Date()` — uses app time (inconsistent).
7. Line 478: `enrolledAt: new Date()` — uses app time (inconsistent).
8. Line 485: `redeemedAt: new Date()` — uses app time (inconsistent).
9. Line 495: `redeemedAt: new Date()` — uses app time (inconsistent).
10. Line 497: `updatedAt: new Date()` — uses app time (inconsistent).
11. Line 503: SQL `NOW()` — uses DB time for the authoritative claim (correct).

**Hypothesis 1:** The inconsistent timestamps could cause forensic confusion if an admin queries `enrolledAt` and `redeemedAt` and they don't match the `NOW()` used for the claim. CONFIRMED: if app clock is 5s behind DB clock, `redeemedAt` would be T-5 while `NOW()` was T.

**Hypothesis 2:** The inconsistent timestamps could cause a functional bug. REJECTED: the `enrolledAt` and `redeemedAt` are not used for any subsequent comparison or access control check. They are purely audit/display fields.

**Conclusion:** The clock-skew causes an inconsistent audit trail but no functional security bug. The fix is low-risk: fetch DB time once and reuse.

**Confidence:** HIGH
**Fix:** Same as CR-1/SEC-1/DBG-1/V-1.
