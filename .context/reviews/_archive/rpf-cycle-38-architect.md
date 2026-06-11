# Architect Review — RPF Cycle 38

**Date:** 2026-04-23
**Reviewer:** architect
**Base commit:** 4dd3d951

## Inventory of Files Reviewed

- `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/` — Invitation route family
- `src/app/api/v1/admin/api-keys/` — API key route family
- `src/lib/assignments/recruiting-constants.ts` — Shared constants
- `src/lib/realtime/realtime-coordination.ts` — SSE coordination architecture
- `src/app/api/v1/submissions/[id]/events/route.ts` — SSE event architecture
- `src/lib/recruiting/access.ts` — Access context caching strategy
- `src/lib/data-retention-maintenance.ts` — Data lifecycle architecture

## Findings

### ARCH-1: Bulk invitation route duplicates the entire invitation creation flow from single route — DRY violation at route level [MEDIUM/MEDIUM]

**Files:** `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/route.ts:44-102` vs `bulk/route.ts:28-87`

**Description:** The single-create and bulk-create routes duplicate significant logic: DB time fetching, expiresAt computation (both `expiryDays` and `expiryDate` paths), NaN guard, "in past" check, "too far" check, and audit event recording. The only difference is the loop over multiple invitations in the bulk route. This duplication led to the case-insensitive email check bug (CR-1/SEC-1) — the single route uses `lower()` but the bulk route uses `inArray()`.

**Concrete failure scenario:** A new validation rule is added to the single-create route (e.g., rejecting invitations for archived assignments). The developer forgets to add the same check to the bulk route. Bulk-created invitations bypass the new validation.

**Fix:** Extract a shared `computeInvitationExpiry(dbNow, expiryDays, expiryDate)` function (also resolves CR-2) and a shared `validateAndPrepareInvitations()` function. Consider having the bulk route call the single-create logic in a loop within the transaction, or extracting the common preparation logic into `recruiting-invitations.ts`.

**Confidence:** High

---

### ARCH-2: `expiryDays * 86400000` arithmetic duplicated across 5 route files — same as CR-2 [LOW/MEDIUM]

**Files:** See CR-2 for the full list.

**Description:** Architectural lens on CR-2: The day-to-ms conversion should be a shared utility, not inline arithmetic. The `recruiting-constants.ts` module is the right home for this.

**Confidence:** High (same finding as CR-2, different perspective)

---

## Previously Deferred Items (Still Present)

- Manual routes duplicate createApiHandler boilerplate (deferred)
- Global timer HMR pattern duplication (deferred)
