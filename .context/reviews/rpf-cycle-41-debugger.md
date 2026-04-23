# Debugger Review — Cycle 41

**Date:** 2026-04-23
**Reviewer:** debugger
**Base commit:** 24a04687

## DBG-1: PATCH route `"redeemed"` transition — latent bug if Zod enum is extended [MEDIUM/MEDIUM]

**File:** `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/[invitationId]/route.ts:96-97`

**Description:** If the `updateRecruitingInvitationSchema` Zod enum is ever extended to include `"redeemed"`, the PATCH route would accept `body.status = "redeemed"`, pass it through the state machine check, and call `updateRecruitingInvitation(id, { status: "redeemed" })`. The library function would execute `UPDATE ... SET status = 'redeemed' WHERE id = ? AND status = 'pending'`, which would succeed for a pending invitation. The invitation would then have `status = 'redeemed'` but `userId = null`, `redeemedAt = null` — the invitation appears redeemed but no user was created.

**Failure mode:** Admin views the invitation, sees "redeemed" status, but the candidate has no user account and cannot log in. The invitation cannot be re-redeemed because `redeemRecruitingToken` checks `status = 'pending'`. The invitation is stuck in an unrecoverable state.

**Fix:** Remove `"redeemed"` from the PATCH route's allowed transitions map.

**Confidence:** Medium (latent bug; safe today)
