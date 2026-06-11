# Code Review — RPF Cycle 36

**Date:** 2026-04-23
**Reviewer:** code-reviewer
**Base commit:** 601ff71a

## Inventory of Files Reviewed

- `src/app/api/v1/` — All API route handlers (85+ routes)
- `src/lib/` — Business logic (auth, db, docker, judge, security, plugins, etc.)
- `src/lib/plugins/chat-widget/` — Chat widget component, tools, route
- `src/lib/db/` — Schema, queries, import/export, import-transfer
- `src/lib/security/` — Rate limiting, CSRF, password hash, sanitize-html
- `src/lib/compiler/` — Execute, catalog
- `src/lib/docker/` — Client, image validation
- `src/app/(dashboard)/dashboard/admin/audit-logs/` — Audit log page + API

## Findings

### CR-1: PATCH invitation route missing NaN guard for expiryDate — inconsistent with POST routes [MEDIUM/HIGH]

**File:** `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/[invitationId]/route.ts:114`

**Description:** The PATCH route at line 114 constructs `expiresAtUpdate = new Date(\`${body.expiryDate}T23:59:59Z\`)` but does NOT include the `Number.isFinite()` guard that was added to the two POST routes in cycle 35. If `body.expiryDate` contains a time component (e.g., `"2026-01-01T00:00:00Z"`), the Date construction produces `Invalid Date`, and the subsequent `expiresAtUpdate <= dbNow` comparison evaluates to `NaN <= Date` which is `false`, bypassing the "in past" validation. The `expiryDateTooFar` check is similarly bypassed.

This is the same bug that was fixed as AGG-2 in cycle 35 for the single and bulk POST routes, but the PATCH route was missed.

**Concrete failure scenario:** An attacker sends a PATCH request with `expiryDate: "2026-01-01T00:00:00Z"`. The constructed Date is invalid, but both validation checks are bypassed. The invitation's expiry is set to Invalid Date/null, effectively making it never-expiring.

**Fix:** Add the same NaN guard after the Date construction:
```typescript
expiresAtUpdate = new Date(`${body.expiryDate}T23:59:59Z`);
if (!Number.isFinite(expiresAtUpdate.getTime())) {
  return apiError("invalidExpiryDate", 400);
}
```

**Confidence:** High

---

### CR-2: Password rehash logic still duplicated in 4 files — incomplete DRY consolidation [MEDIUM/MEDIUM]

**File:** `src/app/api/v1/admin/backup/route.ts:63-82`, `src/app/api/v1/admin/migrate/export/route.ts:57-74`, `src/lib/auth/config.ts:268-291`, `src/lib/assignments/recruiting-invitations.ts:387-402`

**Description:** The `verifyAndRehashPassword` utility was extracted in cycle 34 and used in import/route.ts and restore/route.ts. However, four other locations still use the inline `verifyPassword` + manual rehash pattern. These are:
1. backup/route.ts:63-82 — `verifyPassword` then manual `hashPassword` + `db.update`
2. migrate/export/route.ts:57-74 — same pattern
3. auth/config.ts:268-291 — same pattern
4. recruiting-invitations.ts:387-402 — same pattern, also inside a transaction

The backup and export routes don't use `verifyAndRehashPassword` presumably because they were not included in the scope of the cycle 34 refactoring. The auth/config.ts and recruiting-invitations.ts paths are more complex (auth callback, inside transaction) but could still benefit from using the shared utility.

**Concrete failure scenario:** A developer adds audit logging to the rehash event in `verifyAndRehashPassword` (which already has `logger.info`). The 4 inline locations don't get that audit log, creating an incomplete audit trail.

**Fix:** Replace inline rehash blocks with `verifyAndRehashPassword` calls. For the transaction case in recruiting-invitations.ts, the utility can be called inside the transaction since it performs its own DB update.

**Confidence:** High

---

### CR-3: buildGroupMemberScopeFilter uses string interpolation in SQL LIKE — unescaped LIKE wildcards [LOW/MEDIUM]

**File:** `src/app/(dashboard)/dashboard/admin/audit-logs/page.tsx:150`

**Description:** The `buildGroupMemberScopeFilter` function constructs a LIKE pattern using template string interpolation: `sql\`${auditEvents.details} LIKE '%"groupId":"${groupId}"%'\``. While `groupId` values come from a server-side DB query (nanoid-generated, so they only contain alphanumeric characters), this pattern bypasses the `escapeLikePattern` utility that is used consistently elsewhere in the codebase. If the data source for groupIds ever changes, LIKE wildcard characters in the values could cause unintended matches.

Additionally, this LIKE search assumes a specific JSON structure in the `details` column. If the JSON format changes (e.g., key ordering, whitespace), the filter silently stops matching without any error.

**Concrete failure scenario:** A new code path creates group IDs with underscore characters (e.g., `group_test_1`). The LIKE pattern `%group_test_1%` would also match `groupXtestY1` since `_` is a single-character wildcard in SQL LIKE. While current nanoid IDs don't contain underscores, the pattern is fragile.

**Fix:** Use `escapeLikePattern` for the groupId value, or use a JSON operator (`@>` or `?`) instead of LIKE for JSON field matching:
```typescript
sql`${auditEvents.details} LIKE ${'%"groupId":"' + escapeLikePattern(groupId) + '"%'} ESCAPE '\\'`
```

**Confidence:** Medium (current data is safe; pattern is fragile)

---

### CR-4: Chat widget textarea lacks explicit aria-label — placeholder-only labeling [LOW/LOW]

**File:** `src/lib/plugins/chat-widget/chat-widget.tsx:363-378`

**Description:** The chat widget's `<textarea>` element at line 363 uses `placeholder={t("placeholder")}` but has no `aria-label` attribute. While a placeholder provides some context, WCAG 2.2 SC 1.3.1 notes that placeholder text is not a substitute for a programmatic label. Screen readers may not announce placeholder text consistently. This was identified as a carry-over item from prior cycles (DES-2).

**Fix:** Add `aria-label={t("placeholder")}` or a visible `<label>` element.

**Confidence:** High

---

## Previously Known Items (Verified Fixed in Current Code)

- AGG-1 (Sunset header past date): Fixed in commit 5547624b
- AGG-2 (Recruiting invitation NaN bypass): Fixed in commit 83cc43ee (POST routes only; PATCH route still missing — see CR-1)
- AGG-3 (Stats double scan): Fixed in commit 71611f6c
- AGG-4 (scrollToBottom isStreaming): Fixed in commit 60c77b1e
