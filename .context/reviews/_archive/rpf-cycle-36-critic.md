# Critic Review — RPF Cycle 36

**Date:** 2026-04-23
**Reviewer:** critic
**Base commit:** 601ff71a

## Inventory of Files Reviewed

- All recruiting invitation routes (POST single, POST bulk, PATCH, DELETE)
- Chat widget component and SSE streaming
- Import/export/backup/restore routes
- Audit log filtering
- Password rehash patterns across codebase

## Findings

### CRI-1: PATCH invitation route NaN guard missing — incomplete cycle 35 fix [MEDIUM/HIGH]

**File:** `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/[invitationId]/route.ts:114`

**Description:** The cycle 35 fix for AGG-2 added NaN guards to both POST routes (single at line 76, bulk at line 63) but missed the PATCH route at line 114. This is a consistency gap — the same vulnerability exists in the PATCH route, and the fix should have been applied to all three `new Date(\`${expiryDate}T23:59:59Z\`)` constructions.

This indicates that the cycle 35 remediation plan did not enumerate all call sites where `expiryDate` is used for Date construction. A systematic search for `new Date(\`${body.expiryDate}` would have found all three locations.

**Concrete failure scenario:** Same as AGG-2 from cycle 35 — a time-component in `expiryDate` produces Invalid Date, bypassing validation.

**Fix:** Add `Number.isFinite(expiresAtUpdate.getTime())` guard at line 114-115.

**Confidence:** High

---

### CRI-2: Password rehash DRY consolidation incomplete — 4 locations remain [MEDIUM/MEDIUM]

**File:** `src/app/api/v1/admin/backup/route.ts:63-82`, `src/app/api/v1/admin/migrate/export/route.ts:57-74`, `src/lib/auth/config.ts:268-291`, `src/lib/assignments/recruiting-invitations.ts:387-402`

**Description:** The `verifyAndRehashPassword` utility was created in cycle 34 but only used in 2 of the 6 rehash locations. The remaining 4 still duplicate the inline pattern. This was identified as CR-3 in cycle 34 and AGG-5 in cycle 33 but remains unfixed. The lack of audit logging in the inline versions is a gap.

**Fix:** Replace all inline rehash blocks with `verifyAndRehashPassword`.

**Confidence:** High

---

### CRI-3: buildGroupMemberScopeFilter uses raw string interpolation in LIKE — fragile pattern [LOW/MEDIUM]

**File:** `src/app/(dashboard)/dashboard/admin/audit-logs/page.tsx:150`

**Description:** The LIKE pattern interpolation `%"groupId":"${groupId}"%` bypasses `escapeLikePattern`. While nanoid values are safe, this is inconsistent with the codebase standard and fragile against future changes.

**Fix:** Use `escapeLikePattern` or use JSON operators instead of LIKE.

**Confidence:** Medium
