# Verifier Review — Cycle 41

**Date:** 2026-04-23
**Reviewer:** verifier
**Base commit:** 24a04687

## V-1: PATCH route allows `"redeemed"` transition that bypasses atomic redeem flow [MEDIUM/MEDIUM]

**File:** `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/[invitationId]/route.ts:96-97`

**Description:** Verified that the PATCH route's state machine at line 97 includes `"redeemed"` as a valid `pending ->` transition. Verified that the Zod schema (`updateRecruitingInvitationSchema`) currently limits `status` to `z.enum(["revoked"])`, making this unreachable via the API. Verified that `updateRecruitingInvitation` (recruiting-invitations.ts:192-223) would set status to "redeemed" if called with `status: "redeemed"`, since it only guards with `WHERE status = 'pending'` and does not check the target status value. Verified that this would leave the invitation in a "redeemed" state without a user, enrollment, or access token — breaking the redeem invariant.

**Fix:** Remove `"redeemed"` from the PATCH route's allowed transitions.

**Confidence:** Medium (verified code paths; safe today due to Zod)

---

## V-2: All prior cycle fixes remain intact [VERIFIED]

Verified that the following fixes from cycles 38-40 are still in place:
1. `Date.now()` replaced with `getDbNowUncached()` in assignment PATCH active-contest check (line 103)
2. Non-null assertions removed from anti-cheat heartbeat gap detection (lines 211-213)
3. NaN guard in quick-create route
4. MAX_EXPIRY_MS guard in bulk route expiryDays path
5. Un-revoke transition removed from PATCH route state machine
6. Exam session short-circuit for non-exam assignments
7. ESCAPE clause in SSE LIKE queries
8. Chat widget ARIA label with message count
