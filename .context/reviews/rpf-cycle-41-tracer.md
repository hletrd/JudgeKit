# Tracer Review — Cycle 41

**Date:** 2026-04-23
**Reviewer:** tracer
**Base commit:** 24a04687

## TR-1: Data flow trace for PATCH `"redeemed"` transition [MEDIUM/MEDIUM]

**File:** `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/[invitationId]/route.ts:96-97`

**Trace:**
1. Client sends `PATCH /api/v1/contests/:id/recruiting-invitations/:invId` with `body.status = "redeemed"`
2. Zod schema `updateRecruitingInvitationSchema` rejects `status: "redeemed"` (only `"revoked"` is allowed)
3. If Zod is bypassed (future change), PATCH route state machine at line 97 allows `pending -> redeemed`
4. Route calls `updateRecruitingInvitation(invId, { status: "redeemed" })` at line 139-143
5. Library function executes: `UPDATE recruiting_invitations SET status = 'redeemed', updated_at = NOW() WHERE id = ? AND status = 'pending'`
6. DB row is updated: invitation now has `status = 'redeemed'` but `user_id = NULL`, `redeemed_at = NULL`
7. No user account, enrollment, or access token was created
8. Invitation is now in an unrecoverable state — `redeemRecruitingToken` requires `status = 'pending'`

**Competing hypothesis:** The `"redeemed"` entry was left in the state machine as documentation of a valid business transition, not as a feature. It should be removed since it contradicts the system's invariant that redeeming must go through the token flow.

**Fix:** Remove `"redeemed"` from the PATCH route's allowed transitions.

**Confidence:** Medium
