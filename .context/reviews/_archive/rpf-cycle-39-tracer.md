# Tracer Review — Cycle 39

**Date:** 2026-04-23
**Reviewer:** tracer
**Base commit:** c176d8f5

## TRACE-1: Bulk invitation `expiryDays` -> `MAX_EXPIRY_MS` gap [MEDIUM/HIGH]

**Causal trace:**
1. Client sends POST to `/api/v1/contests/[assignmentId]/recruiting-invitations/bulk` with `expiryDays: 3650`
2. Zod schema validates: `expiryDays: z.number().int().min(1).max(3650)` — passes
3. Handler maps `body.invitations.map(inv => ...)` — line 61
4. For each invitation: `if (inv.expiryDays)` — line 64 — true
5. `expiresAt = computeExpiryFromDays(dbNow, inv.expiryDays)` — line 65
6. No MAX_EXPIRY_MS check here (unlike single-create route line 90-92)
7. `expiresAt` is used directly in `bulkCreateRecruitingInvitations` call — line 82-87
8. Invitation is created with `expiresAt` far in the future

**Competing hypothesis 1:** The `MAX_EXPIRY_MS` check was intentionally omitted because Zod `max(3650)` is sufficient.
**Competing hypothesis 2:** The `MAX_EXPIRY_MS` check was accidentally omitted during the cycle 38 refactoring.

**Assessment:** Hypothesis 2 is more likely. The single-create route has the check, and the bulk route had it for `expiryDate` but not `expiryDays`. This is an oversight.

**Confidence:** Medium

---

## TRACE-2: Invitation un-revoke broken path [MEDIUM/MEDIUM]

**Causal trace:**
1. Client sends PATCH to `/api/v1/contests/[assignmentId]/recruiting-invitations/[invitationId]` with `{ status: "pending" }`
2. Route handler: `body.status !== undefined && body.status !== invitation.status` — line 88 — true (invitation is "revoked")
3. State machine check: `allowed["revoked"]` = `["pending"]` — line 97-99 — "pending" is allowed
4. `updateRecruitingInvitation(params.invitationId, { ..., status: "pending" })` — line 135-139
5. Library function: `db.update(recruitingInvitations).set({ status: "pending" }).WHERE(status = 'pending')` — line 207-213
6. WHERE clause fails because current status is "revoked", not "pending"
7. `rowCount === 0` — line 214 — true
8. Throws `new Error("invitationCannotBeRevoked")` — misleading message
9. Error propagates to `createApiHandler`'s generic catch — returns 500 "internalServerError"

**Competing hypothesis 1:** The "un-revoke" feature was intentionally added to the state machine but the library was never updated to support it.
**Competing hypothesis 2:** The "pending" target in the revoked array was a copy-paste error.

**Assessment:** Hypothesis 1 is more likely given the explicit state machine definition. The library function was not updated to match.

**Confidence:** Medium
