# Architectural Review — Cycle 41

**Date:** 2026-04-23
**Reviewer:** architect
**Base commit:** 24a04687

## ARCH-1: PATCH route state machine includes "redeemed" transition that violates the redeem token invariant [MEDIUM/MEDIUM]

**File:** `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/[invitationId]/route.ts:96-97`

**Description:** The PATCH route defines a state machine with `pending: ["revoked", "redeemed"]`. The "redeemed" transition violates the architectural invariant that redeeming an invitation must go through the `redeemRecruitingToken` transaction, which atomically: (1) validates the token hash, (2) checks expiry via SQL NOW(), (3) creates a user account, (4) creates an enrollment, (5) creates an access token, and (6) atomically claims the invitation. The PATCH route bypasses all of these steps.

The `updateRecruitingInvitation` library function (line 192-223) only has a `WHERE status = 'pending'` guard, so it would set `status = 'redeemed'` without creating any of the associated records. This is a layering violation: the PATCH route's state machine should not advertise a transition that would break the system's data integrity invariants.

**Concrete failure scenario:** See CR-1 and SEC-1 for the same finding from code-quality and security perspectives.

**Fix:** Remove `"redeemed"` from the PATCH route's allowed transitions. If a "force-redeem" admin feature is needed in the future, it should be implemented as a separate endpoint that goes through the full `redeemRecruitingToken` transaction (or a variant of it).

**Confidence:** Medium (layering violation; safe today due to Zod)

---

## ARCH-2: Stale-while-revalidate cache pattern duplicated between contest-scoring and contest-analytics [LOW/LOW]

**Files:** `src/lib/assignments/contest-scoring.ts:97-130` vs `src/app/api/v1/contests/[assignmentId]/analytics/route.ts:53-84`

**Description:** Both files implement the same stale-while-revalidate cache pattern with `_refreshingKeys`, `_lastRefreshFailureAt`, `REFRESH_FAILURE_COOLDOWN_MS`, and the "return stale + background refresh" logic. The implementation is nearly identical, differing only in the cached data type and cache configuration (max size, TTL). This is a DRY violation, though both modules work correctly.

**Confidence:** Low (already noted as deferred in prior cycles)

---

## Previously Flagged Items Still Present

- `computeExpiryFromDays` naming in recruiting-constants.ts — noted in cycle 39
- Console.error in client components — deferred
