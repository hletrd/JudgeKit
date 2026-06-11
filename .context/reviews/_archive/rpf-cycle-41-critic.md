# Critic Review — Cycle 41

**Date:** 2026-04-23
**Reviewer:** critic
**Base commit:** 24a04687

## CRI-1: PATCH route `"redeemed"` transition violates data integrity invariant [MEDIUM/MEDIUM]

**File:** `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/[invitationId]/route.ts:97`

**Description:** Same finding as CR-1, SEC-1, ARCH-1. The PATCH route's state machine includes `"redeemed"` as a valid transition from `"pending"`, which would bypass the atomic `redeemRecruitingToken` transaction. The Zod schema currently blocks this, but the state machine is architecturally wrong — it advertises a transition that would corrupt data integrity if ever allowed through the API.

**Fix:** Remove `"redeemed"` from the allowed transitions map.

**Confidence:** Medium

---

## CRI-2: Audit log LIKE-based JSON search is fragile [LOW/LOW]

**File:** `src/app/(dashboard)/dashboard/admin/audit-logs/page.tsx:150`

**Description:** The `buildGroupMemberScopeFilter` function uses LIKE to match JSON keys in the `details` column. While `escapeLikePattern` is correctly applied, the approach is fragile against JSON serialization changes (whitespace, key ordering). PostgreSQL JSONB containment operators would be more robust.

**Fix:** Use `details @> '{"groupId":"VALUE"}'::jsonb` instead of LIKE pattern.

**Confidence:** Low (works today; defensive improvement)
