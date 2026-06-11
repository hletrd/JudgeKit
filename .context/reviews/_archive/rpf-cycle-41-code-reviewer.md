# Code Review — Cycle 41

**Date:** 2026-04-23
**Reviewer:** code-reviewer
**Base commit:** 24a04687

## CR-1: `updateRecruitingInvitation` TypeScript type allows `"redeemed"` as status but `WHERE` clause blocks it [MEDIUM/MEDIUM]

**File:** `src/lib/assignments/recruiting-invitations.ts:197` vs `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/[invitationId]/route.ts:97`

**Description:** The PATCH route's state machine at line 96-97 lists `"redeemed"` as a valid transition from `"pending"`, but the `updateRecruitingInvitation` function's `WHERE status = 'pending'` clause (line 210) would allow the update to proceed — setting status to `"redeemed"` without creating the associated user, enrollment, or access token. The Zod schema currently limits `status` to `z.enum(["revoked"])`, so this cannot be triggered via the API today. However, the route's state machine listing `"redeemed"` as a valid transition is misleading and could lead a developer to assume the transition is safe.

**Concrete failure scenario:** A developer sees the state machine allows `pending -> redeemed` and adds `"redeemed"` to the Zod enum. The PATCH route then allows direct status changes to "redeemed", which bypasses the `redeemRecruitingToken` transaction that creates the user, enrollment, and access token. The invitation ends up in a "redeemed" state with `userId = null`, breaking the invite-to-redeem invariant.

**Fix:** Remove `"redeemed"` from the PATCH route's allowed transitions map (line 97). The `"redeemed"` status should only be set through the `redeemRecruitingToken` flow, not through a PATCH.

**Confidence:** Medium (currently safe due to Zod, but architectural inconsistency)

---

## CR-2: Audit logs page LIKE filter concatenates JSON key pattern without escaping the groupId value inside the JSON pattern [LOW/MEDIUM]

**File:** `src/app/(dashboard)/dashboard/admin/audit-logs/page.tsx:150`

**Description:** The `buildGroupMemberScopeFilter` function builds a LIKE pattern: `'"groupId":"' + escapeLikePattern(groupId) + '"'`. The `escapeLikePattern` call escapes SQL LIKE wildcards (`%`, `_`, `\`) in the `groupId`, which is correct. However, the pattern `%"groupId":"VALUE"%` is brittle — it relies on JSON serialization order and absence of whitespace variations. If the JSON serializer ever changes (e.g., adds spaces after colons), the filter would silently stop matching rows. The `escapeLikePattern` call itself is correct for its purpose, but the overall approach is fragile.

**Concrete failure scenario:** A future version of the audit logger adds a space after the colon in JSON serialization, producing `{"groupId": "abc"}` instead of `{"groupId":"abc"}`. The LIKE pattern `%"groupId":"abc"%` no longer matches, and audit logs for that group disappear from the admin view.

**Fix:** Consider using PostgreSQL JSONB operators (`details @> '{"groupId":"VALUE"}'::jsonb`) instead of LIKE pattern matching on JSON strings. This is more robust and also uses a GIN index if available.

**Confidence:** Low (works today, fragile against serialization changes)

---

## Previously Flagged Items Still Present

- Console.error in client components — previously deferred
- `computeExpiryFromDays` naming in `recruiting-constants.ts` — noted in cycle 39, LOW/LOW
- `new Date()` for min date in recruiting invitations panel — noted in cycle 39, LOW
