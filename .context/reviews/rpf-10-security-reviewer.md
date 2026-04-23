# Cycle 10 Security Review

**Date:** 2026-04-20
**Reviewer:** security-reviewer
**Base commit:** fae77858

## Findings

### SEC-1: Access code redemption `enrolledAt`/`redeemedAt` use `new Date()` while deadline check uses DB `NOW()` — clock-skew inconsistency [MEDIUM/HIGH]

**Files:** `src/lib/assignments/access-codes.ts:170,189`
**Description:** The `redeemAccessCode` function uses `SELECT NOW()` to get the authoritative DB time for deadline enforcement (line 130-134), but then writes `enrolledAt: new Date()` and `redeemedAt: new Date()` using app server time. This means the same transaction uses two different time sources. While the security-critical deadline check uses DB time (correct), the audit trail timestamps may not match. An attacker with clock-skew knowledge could potentially exploit this discrepancy in forensic analysis.
**Fix:** Replace with the `now` variable already fetched from DB.
**Confidence:** High

### SEC-2: `withUpdatedAt()` defaulting to `new Date()` is a systemic clock-skew risk [LOW/MEDIUM]

**Files:** `src/lib/db/helpers.ts:20`
**Description:** The `withUpdatedAt` helper defaults to `new Date()` and is used in multiple places that may not have fetched DB time (e.g., `access-codes.ts:33,69`). This creates a systemic risk: any new code using `withUpdatedAt()` without passing `now` silently introduces clock-skew. This is a defense-in-depth concern rather than a direct vulnerability.
**Fix:** Make `now` a required parameter in `withUpdatedAt()`, or have it internally call `getDbNowUncached()`.
**Confidence:** Medium

### SEC-3: Recruiting invitation `updateRecruitingInvitation` uses `new Date()` for `updatedAt` [LOW/MEDIUM]

**Files:** `src/lib/assignments/recruiting-invitations.ts:194,244,252`
**Description:** The `updateRecruitingInvitation` function and `resetRecruitingInvitationAccountPassword` write `updatedAt: new Date()` using app server time. These are audit-relevant timestamps on invitation state changes.
**Fix:** Import and use `getDbNowUncached()`.
**Confidence:** Medium

### SEC-4: `recruiting-invitations.ts` `redeemRecruitingToken` uses `new Date()` for enrollment/redemption timestamps [LOW/MEDIUM]

**Files:** `src/lib/assignments/recruiting-invitations.ts:477,484,494,496`
**Description:** Already tracked as deferred D13/D20 from prior cycles. The atomic SQL claim at line 502 uses `NOW()` which is the security-critical check. Reiterating for completeness.
**Fix:** Use `getDbNowUncached()` at the start of the function.
**Confidence:** High (already known, deferred)

## Verified Safe

- CSRF protection is in place for server actions.
- Rate limiting uses PostgreSQL SELECT FOR UPDATE for TOCTOU prevention.
- Recruiting token flow uses atomic SQL transactions for claim validation.
- HTML sanitization uses DOMPurify with strict allowlists.
- Auth flow has Argon2id with timing-safe dummy hash.
- No secrets leaked in client-side code.
- CSP headers are comprehensive and properly configured.
- HSTS is correctly configured based on x-forwarded-proto.
