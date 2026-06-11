# Code Review — Cycle 39

**Date:** 2026-04-23
**Reviewer:** code-reviewer
**Base commit:** c176d8f5

## CR-1: Bulk invitation `expiryDate` validation bypasses `MAX_EXPIRY_MS` for `expiryDays=0` edge case [MEDIUM/HIGH]

**File:** `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/bulk/route.ts:63-81`

**Description:** The bulk route computes `expiresAt` from `expiryDays` or `expiryDate`, but the `MAX_EXPIRY_MS` check on line 78 only fires when `inv.expiryDate` is set. If `inv.expiryDays` is provided, there is no equivalent `MAX_EXPIRY_MS` guard. The Zod schema limits `expiryDays` to `max(3650)`, and `3650 * 86400000 = 315,360,000,000` which is less than `MAX_EXPIRY_MS` (~315.58 billion), so the current maximum is safe. However, the single-create route (line 90) does check `MAX_EXPIRY_MS` for `expiryDays` too, creating an inconsistency. If the Zod max is ever raised, the bulk route would accept unreasonably far-future expiry dates without the defense-in-depth guard.

**Concrete failure scenario:** A future PR raises `expiryDays` max to 10000 (about 27 years). The single-create route's `MAX_EXPIRY_MS` check would reject it, but the bulk route would accept it, creating an invitation that expires 27 years in the future.

**Fix:** Add a `MAX_EXPIRY_MS` check after `computeExpiryFromDays` in the bulk route, consistent with the single-create route.

**Confidence:** Medium (not exploitable today due to Zod max, but inconsistency is a latent bug)

---

## CR-2: `recruiting-invitations-panel.tsx` uses `new Date()` for min date instead of server time [LOW/MEDIUM]

**File:** `src/components/contest/recruiting-invitations-panel.tsx:462`

**Description:** The custom expiry date picker uses `new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().split("T")[0]` to set the minimum selectable date. This uses the browser's local clock. If the user's clock is behind server time, they could select a date that the server would reject as "in the past". If the user's clock is ahead, they might see dates as available that are actually expired.

**Concrete failure scenario:** A user in a timezone ahead of UTC selects today's date as the expiry. The server computes `expiresAt` as `YYYY-MM-DDT23:59:59Z`, which may already be in the past relative to DB time, causing a 400 error.

**Fix:** This is a minor UX issue. The server-side validation already catches this. A future enhancement could fetch `/api/v1/time` and use that for the min date.

**Confidence:** Low (server-side validation prevents data corruption; this is UX polish)

---

## CR-3: `updateRecruitingInvitation` accepts `status: "revoked"` but the PATCH route also allows `status: "redeemed"` transition from "pending" [MEDIUM/MEDIUM]

**File:** `src/lib/assignments/recruiting-invitations.ts:195-199` vs `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/[invitationId]/route.ts:96-99`

**Description:** The `updateRecruitingInvitation` function's TypeScript type restricts `status` to `"revoked"`, but the PATCH route's status state machine (line 96-99) allows transitioning from "pending" to both "revoked" and "redeemed". However, the call to `updateRecruitingInvitation` on line 135-139 passes `body.status` directly. If `body.status` were somehow "redeemed", it would be passed to `updateRecruitingInvitation` which would try to set status to "redeemed", but the `WHERE status = 'pending'` clause in the update (line 211) would still allow it since it only checks for pending. This means a PATCH with `status: "redeemed"` would set the status to "redeemed" without creating the associated user, enrollment, or access token -- breaking the invite-to-redeem invariant.

The Zod schema (`updateRecruitingInvitationSchema`) limits `status` to `z.enum(["revoked"])`, so this cannot currently be triggered via the API. But the route-level state machine and the library function are inconsistent.

**Concrete failure scenario:** A developer adds a new status value to the Zod enum or adds a server action that calls `updateRecruitingInvitation` with `status: "redeemed"`. The function would set the status to "redeemed" without creating the associated user account, enrollment, or contest access token, leaving the invitation in an unrecoverable state.

**Fix:** Either tighten the `updateRecruitingInvitation` type to reject non-"revoked" values at runtime, or remove the "redeemed" transition from the PATCH route's state machine (since redeeming should only happen through the token redemption flow).

**Confidence:** Medium (currently safe due to Zod, but architectural inconsistency)

---

## CR-4: `entryProblemMaps` creates a Map per entry but is only used for iteration [LOW/LOW]

**File:** `src/lib/assignments/contest-analytics.ts:125-128`

**Description:** `entryProblemMaps` creates a `Map<problemId, problemResult>` for every contest entry, but the only usage is iterating with `for (const epMap of entryProblemMaps)` and calling `epMap.get(p.problemId)`. This is O(n*m) where n=entries and m=problems. An inverted index (Map<problemId, Array<score & attempts>>) would be O(m) for building + O(m*n) for the same iteration, but with better cache locality. This is already noted in prior deferrals (PERF-1 analytics).

**Confidence:** Low (already deferred)

---

## Previously Flagged Items Still Present

- Console.error in client components (discussions, compiler-client, etc.) — previously deferred
- DRY violations in invitation route logic — partially addressed (AGG-6 still deferred)
