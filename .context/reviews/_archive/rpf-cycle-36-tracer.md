# Tracer Review — RPF Cycle 36

**Date:** 2026-04-23
**Reviewer:** tracer
**Base commit:** 601ff71a

## Inventory of Files Reviewed

- Recruiting invitation data flow (create → validate → store → query)
- Password rehash data flow (verify → check needsRehash → rehash → update)
- Chat widget message flow (input → sendMessage → SSE → render → scroll)
- Audit log filtering flow (page → buildGroupMemberScopeFilter → query)

## Findings

### TR-1: PATCH invitation NaN bypass — traced data flow confirms vulnerability [MEDIUM/HIGH]

**File:** `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/[invitationId]/route.ts:108-126`

**Description:** Tracing the data flow:

1. `body.expiryDate` arrives from the Zod-validated request body (enforces YYYY-MM-DD via regex)
2. `expiresAtUpdate = new Date(\`${body.expiryDate}T23:59:59Z\`)` — if `body.expiryDate` somehow contains a time component, this produces Invalid Date
3. `if (expiresAtUpdate <= dbNow)` — `NaN <= Date` → `false` — bypass!
4. `if ((expiresAtUpdate.getTime() - dbNow.getTime()) > MAX_EXPIRY_MS)` — `NaN > Number` → `false` — bypass!
5. `expiresAtUpdate` (Invalid Date) is passed to `updateRecruitingInvitation`
6. Drizzle stores `Invalid Date` which becomes `NULL` or causes a DB error

The POST routes have a guard at step 2.5 that catches this. The PATCH route does not.

**Hypothesis 1 (confirmed):** The cycle 35 fix was incomplete — only 2 of 3 routes were patched.
**Hypothesis 2 (rejected):** The PATCH route doesn't need the guard because its Zod schema is different. Rejected — the PATCH and POST routes use different schemas but both accept `expiryDate` with the same format.

**Fix:** Add `Number.isFinite(expiresAtUpdate.getTime())` guard after line 114.

**Confidence:** High

---

### TR-2: Password rehash audit trail gap — traced across all 6 call sites [MEDIUM/MEDIUM]

**Description:** Tracing the rehash audit trail across all 6 call sites:

1. `verifyAndRehashPassword` (password-hash.ts:51-70) — includes `logger.info` ✓
2. `import/route.ts` — uses `verifyAndRehashPassword` ✓
3. `restore/route.ts` — uses `verifyAndRehashPassword` ✓
4. `backup/route.ts:63-82` — inline, NO audit log ✗
5. `migrate/export/route.ts:57-74` — inline, NO audit log ✗
6. `auth/config.ts:268-291` — inline, NO audit log ✗
7. `recruiting-invitations.ts:387-402` — inline, NO audit log ✗

Sites 4-7 are missing the `[password-rehash]` audit log that the centralized utility provides. This creates a gap in the audit trail — security auditors cannot determine how many rehashes happened via backup/export/login/recruiting vs. import/restore.

**Fix:** Replace inline rehash blocks with `verifyAndRehashPassword` in all 4 remaining sites.

**Confidence:** High

---

### TR-3: buildGroupMemberScopeFilter LIKE pattern — traced input source [LOW/MEDIUM]

**File:** `src/app/(dashboard)/dashboard/admin/audit-logs/page.tsx:142-153`

**Description:** Tracing the input: `groupIds` come from `db.query.groups.findMany({ where: eq(groups.instructorId, session.user.id) })`. These are nanoid-generated strings (alphanumeric only), so LIKE wildcard injection is not possible with current data. However, the pattern is fragile and inconsistent with the codebase standard.

**Fix:** Use `escapeLikePattern` for consistency and defense-in-depth.

**Confidence:** Medium
