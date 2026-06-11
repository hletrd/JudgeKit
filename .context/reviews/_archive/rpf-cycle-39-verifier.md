# Verifier Review — Cycle 39

**Date:** 2026-04-23
**Reviewer:** verifier
**Base commit:** c176d8f5

## V-1: Bulk invitation `expiryDays` path does not enforce `MAX_EXPIRY_MS` [MEDIUM/HIGH]

**Status:** Confirmed. The bulk route at `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/bulk/route.ts:64-66` computes `expiresAt` from `expiryDays` using `computeExpiryFromDays(dbNow, inv.expiryDays)` but does not check whether the resulting date exceeds `MAX_EXPIRY_MS` from now. The single-create route at line 90-92 does perform this check. The Zod schema's `max(3650)` constraint currently prevents exploitation.

**Evidence:**
- Bulk route: lines 64-66 — no MAX_EXPIRY_MS check after computeExpiryFromDays
- Single route: lines 90-92 — checks `(expiresAt.getTime() - dbNow.getTime()) > MAX_EXPIRY_MS`
- Zod schema: `expiryDays: z.number().int().min(1).max(3650)` — 3650 days is within MAX_EXPIRY_MS

**Confidence:** High (verified by code comparison)

---

## V-2: "Un-revoke" invitation transition is broken [MEDIUM/MEDIUM]

**Status:** Confirmed. The PATCH route at `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/[invitationId]/route.ts:96-99` defines `revoked: ["pending"]` as an allowed transition. But `updateRecruitingInvitation` at `src/lib/assignments/recruiting-invitations.ts:207-213` has `WHERE status = 'pending'` in the UPDATE, which will never match a revoked invitation. The function throws `invitationCannotBeRevoked` which is misleading for an "un-revoke" attempt.

**Evidence:**
- Route allows `revoked -> pending`
- Library function's WHERE clause only matches `status = 'pending'`
- Error message is semantically wrong for un-revoke

**Confidence:** High (verified by code tracing)

---

## V-3: Exam session POST route does not short-circuit for non-exam assignments [MEDIUM/MEDIUM]

**Status:** Confirmed. The route at `src/app/api/v1/groups/[id]/assignments/[assignmentId]/exam-session/route.ts:24-28` queries only `{ id: true, groupId: true }` from the assignment, then delegates to `startExamSession` which queries the assignment again with full fields. If `examMode` is "none", the second query and validation happen unnecessarily.

**Evidence:** Line 24-28 fetches limited columns; the `startExamSession` function performs a separate query.

**Confidence:** High (verified by code tracing)

---

## Previously Verified Fixes (Still Passing)

- Bulk invitation case-insensitive email dedup — working correctly
- `computeExpiryFromDays` shared helper — working correctly
- Chat widget `role="alert"` — present in code
- API key auto-dismiss timer — present in code
