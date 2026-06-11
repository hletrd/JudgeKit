# Architectural Review — Cycle 39

**Date:** 2026-04-23
**Reviewer:** architect
**Base commit:** c176d8f5

## ARCH-1: Status state machine split between PATCH route and `updateRecruitingInvitation` [MEDIUM/MEDIUM]

**Files:** `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/[invitationId]/route.ts:96-99` vs `src/lib/assignments/recruiting-invitations.ts:195-199`

**Description:** The PATCH route defines a state machine for status transitions (pending -> revoked, revoked -> pending), but the underlying `updateRecruitingInvitation` function has its own check that only allows revoking pending invitations. These two layers are inconsistent: the route allows "revoked" -> "pending" transitions, but the function's `WHERE status = 'pending'` clause would silently reject a "revoked" -> "pending" update (returning 0 rows affected and throwing `invitationCannotBeRevoked`). The error message is also misleading for this case.

**Concrete failure scenario:** An instructor tries to un-revoke a revoked invitation via PATCH with `status: "revoked"` change to... wait, the route's state machine allows `revoked -> ["pending"]`, meaning a PATCH with `status: "pending"` on a revoked invitation. The route validates the transition, then calls `updateRecruitingInvitation` which tries `WHERE status = 'pending'` — but the invitation's status is "revoked", so the WHERE clause fails. The error message "invitationCannotBeRevoked" is confusing in this context.

**Fix:** Move the state machine enforcement into `updateRecruitingInvitation` or align the library function's WHERE clause with the route's state machine.

**Confidence:** Medium (the "un-revoke" feature is defined in the route but broken in practice)

---

## ARCH-2: `computeExpiryFromDays` lives in `recruiting-constants.ts` but is used by API key routes too [LOW/LOW]

**File:** `src/lib/assignments/recruiting-constants.ts:19-21`

**Description:** The `computeExpiryFromDays` helper was extracted from recruiting invitation routes (cycle 38) and placed in `recruiting-constants.ts`. However, it's also imported by `src/app/api/v1/admin/api-keys/route.ts` and `src/app/api/v1/admin/api-keys/[id]/route.ts`. The module name "recruiting-constants" is misleading when the helper is used across domains. This is a minor naming concern, not a functional issue.

**Confidence:** Low (naming concern only)

---

## ARCH-3: Exam session POST route does not verify exam mode [MEDIUM/MEDIUM]

**File:** `src/app/api/v1/groups/[id]/assignments/[assignmentId]/exam-session/route.ts:24-28`

**Description:** The exam session POST route verifies that the assignment belongs to the group and that the user has access, but it does not check `assignment.examMode`. The `startExamSession` function (in the library) does check exam mode and returns "examModeInvalid" if it's "none". However, the route fetches the assignment first with only `{ id: true, groupId: true }` columns, not including `examMode`. This means the route will proceed to call `startExamSession` for non-exam assignments, which will then fail with an error. The error is handled, but the route could short-circuit earlier by checking exam mode in the initial query.

**Concrete failure scenario:** A student sends a POST request to start an exam session for a non-exam assignment. The route fetches the assignment, validates access, then calls `startExamSession` which queries the assignment again to check exam mode. This results in an unnecessary extra DB query.

**Fix:** Include `examMode` in the initial assignment query and short-circuit with an error if it's "none".

**Confidence:** Medium (functional but inefficient; extra DB query)
