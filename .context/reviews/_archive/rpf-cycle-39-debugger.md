# Debugger Review — Cycle 39

**Date:** 2026-04-23
**Reviewer:** debugger
**Base commit:** c176d8f5

## DBG-1: Bulk invitation `expiryDays` path missing `MAX_EXPIRY_MS` guard [MEDIUM/HIGH]

**File:** `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/bulk/route.ts:64-66`

**Description:** Same as CR-1/SEC-1. The `computeExpiryFromDays` result is used directly without checking if the resulting Date exceeds `MAX_EXPIRY_MS` from `dbNow`. The single-create route performs this check at line 90-92. The Zod `max(3650)` prevents exploitation today.

**Failure mode:** If Zod schema is relaxed, bulk route would accept unreasonably far-future expiry dates while single route would reject them.

**Fix:** Add `if (expiresAt && (expiresAt.getTime() - dbNow.getTime()) > MAX_EXPIRY_MS)` check after `computeExpiryFromDays`.

**Confidence:** Medium

---

## DBG-2: `updateRecruitingInvitation` silently fails on "un-revoke" [MEDIUM/MEDIUM]

**File:** `src/lib/assignments/recruiting-invitations.ts:207-213`

**Description:** When the PATCH route allows `revoked -> pending` transition and calls `updateRecruitingInvitation(id, { status: "pending" })`, the function's `WHERE status = 'pending'` clause rejects the update because the current status is "revoked". The `rowCount === 0` check throws "invitationCannotBeRevoked" which is semantically wrong for an un-revoke attempt.

**Failure mode:** An instructor tries to un-revoke an invitation. The API returns a 500 error (unhandled "invitationCannotBeRevoked" string), which the route handler does not catch as a known error.

Wait — checking the PATCH route more carefully: the route catches errors thrown by `updateRecruitingInvitation`? No, looking at the route code (lines 135-139), it calls `await updateRecruitingInvitation(...)` and the function throws `new Error("invitationCannotBeRevoked")`. But the route doesn't catch this — it propagates up to `createApiHandler`'s generic catch which returns a 500. So the user sees "internalServerError" instead of a meaningful error.

**Fix:** Either: (a) remove "pending" from the allowed transitions in the route's state machine, or (b) fix `updateRecruitingInvitation` to support un-revoking, or (c) add the error message to the route's catch block.

**Confidence:** High (verified by code tracing)

---

## DBG-3: Exam session route double-fetches assignment [LOW/MEDIUM]

**File:** `src/app/api/v1/groups/[id]/assignments/[assignmentId]/exam-session/route.ts:24-28`

**Description:** The route fetches the assignment with `{ id: true, groupId: true }` columns, then `startExamSession` fetches it again. Not a bug, but wastes a DB query when the assignment's exam mode is "none".

**Confidence:** Low

---

## No New Race Conditions or Memory Leaks Found

The SSE connection management, anti-cheat heartbeat timer, and chat widget stream handling all have proper cleanup in their effect/timeout teardowns. The recent `computeExpiryFromDays` extraction is pure and introduces no new state.
