# RPF Cycle 36 — Aggregate Review

**Date:** 2026-04-23
**Base commit:** 601ff71a
**Review artifacts:** rpf-cycle-36-code-reviewer.md, rpf-cycle-36-perf-reviewer.md, rpf-cycle-36-security-reviewer.md, rpf-cycle-36-architect.md, rpf-cycle-36-critic.md, rpf-cycle-36-verifier.md, rpf-cycle-36-debugger.md, rpf-cycle-36-test-engineer.md, rpf-cycle-36-tracer.md, rpf-cycle-36-designer.md, rpf-cycle-36-document-specialist.md

## Deduped Findings (sorted by severity then signal)

### AGG-1: PATCH invitation route missing NaN guard for expiryDate — incomplete cycle 35 fix [MEDIUM/HIGH]

**Flagged by:** code-reviewer (CR-1), security-reviewer (SEC-1), critic (CRI-1), verifier (V-1), debugger (DBG-1), tracer (TR-1), test-engineer (TE-1), document-specialist (DOC-1)
**Signal strength:** 8 of 11 review perspectives

**File:** `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/[invitationId]/route.ts:114`

**Description:** The PATCH route constructs `expiresAtUpdate = new Date(\`${body.expiryDate}T23:59:59Z\`)` without the `Number.isFinite()` defense-in-depth check. The two POST routes (single and bulk) received this guard in cycle 35 as AGG-2, but the PATCH route was missed. If `body.expiryDate` contains a time component, the Date construction produces `Invalid Date`, and all subsequent numeric comparisons with NaN return false, bypassing both "date in past" and "too far future" validation checks.

**Concrete failure scenario:** An attacker sends a PATCH request with `expiryDate: "2026-01-01T00:00:00Z"`. The constructed Date is invalid, but validation checks are bypassed. The invitation's expiry is set to an invalid/null value, effectively making it never-expiring.

**Fix:** Add the NaN guard after the Date construction:
```typescript
expiresAtUpdate = new Date(`${body.expiryDate}T23:59:59Z`);
if (!Number.isFinite(expiresAtUpdate.getTime())) {
  return apiError("invalidExpiryDate", 400);
}
```

---

### AGG-2: Password rehash logic still duplicated in 4 files — incomplete DRY consolidation from cycle 34 [MEDIUM/MEDIUM]

**Flagged by:** code-reviewer (CR-2), security-reviewer (implied), architect (ARCH-1), critic (CRI-2), verifier (V-2), tracer (TR-2)
**Signal strength:** 6 of 11 review perspectives

**Files:** `src/app/api/v1/admin/backup/route.ts:63-82`, `src/app/api/v1/admin/migrate/export/route.ts:57-74`, `src/lib/auth/config.ts:268-291`, `src/lib/assignments/recruiting-invitations.ts:387-402`

**Description:** The `verifyAndRehashPassword` utility was extracted in cycle 34 but only used in import/route.ts and restore/route.ts. Four other locations still use the inline `verifyPassword` + manual rehash + `db.update` pattern. The centralized utility includes `logger.info` for audit logging of rehash events, but the inline versions do not, creating an audit trail gap. This was identified as CR-3/AGG-5 in cycles 33-34 but only partially fixed.

**Concrete failure scenario:** A security auditor asks "how many passwords were transparently rehashed from bcrypt to argon2id?" — only the import/restore rehashes appear in logs, while backup, export, login, and recruiting-invitation rehashes are invisible.

**Fix:** Replace all inline rehash blocks with `verifyAndRehashPassword`:
- `backup/route.ts:63-82` — straightforward replacement
- `migrate/export/route.ts:57-74` — straightforward replacement
- `recruiting-invitations.ts:387-402` — can be called inside the existing transaction
- `auth/config.ts:268-291` — may need special handling due to NextAuth callback context

---

### AGG-3: buildGroupMemberScopeFilter uses raw string interpolation in SQL LIKE without escaping [LOW/MEDIUM]

**Flagged by:** code-reviewer (CR-3), security-reviewer (SEC-2), critic (CRI-3), tracer (TR-3)
**Signal strength:** 4 of 11 review perspectives

**File:** `src/app/(dashboard)/dashboard/admin/audit-logs/page.tsx:150`

**Description:** The LIKE pattern `%"groupId":"${groupId}"%` uses raw string interpolation without `escapeLikePattern()`. While `groupId` values originate from a server-side DB query (nanoid-generated, alphanumeric only), this bypasses the codebase-standard `escapeLikePattern` utility. The pattern is inconsistent with all other LIKE queries and fragile against future data changes.

**Concrete failure scenario:** A new code path creates group IDs with underscore characters (e.g., `group_test_1`). The LIKE `%group_test_1%` matches `groupXtestY1` since `_` is a single-character wildcard.

**Fix:** Use `escapeLikePattern(groupId)` in the LIKE pattern, or use PostgreSQL JSON operators instead of LIKE for JSON field matching.

---

### AGG-4: Chat widget textarea lacks explicit aria-label [LOW/LOW]

**Flagged by:** code-reviewer (CR-4), debugger (DBG-2), designer (DES-1), test-engineer (TE-3)
**Signal strength:** 4 of 11 review perspectives

**File:** `src/lib/plugins/chat-widget/chat-widget.tsx:363`

**Description:** The textarea has `placeholder={t("placeholder")}` but no `aria-label`. WCAG 2.2 SC 1.3.1 recommends programmatic labels over placeholder text. This is a carry-over from prior cycles (DES-2). The placeholder provides some context but is not consistently announced by screen readers.

**Fix:** Add `aria-label={t("placeholder")}` to the textarea element.

---

## Carry-Over Items (Still Unfixed from Prior Cycles)

- **Prior AGG-5:** Console.error in client components instead of structured logging (deferred)
- **Prior AGG-6:** SSE O(n) eviction scan (deferred)
- **Prior AGG-7:** Manual routes duplicate createApiHandler boilerplate (deferred)
- **Prior AGG-8:** Global timer HMR pattern duplication (deferred)
- **Prior SEC-3:** Anti-cheat copies user text content (deferred)
- **Prior SEC-4:** Docker build error leaks paths (deferred)
- **CR-4 (carry-over):** Chat widget entry animation not using motion-safe prefix (globals.css override is functional)

## Deferred Items

| Finding | File+Line | Severity/Confidence | Reason for Deferral | Exit Criterion |
|---------|-----------|-------------------|--------------------|---------------|
| SEC-3: Import route JSON body path with password | migrate/import/route.ts:113-191 | MEDIUM/MEDIUM | Deprecated with Sunset header; functional for backward compatibility | Sunset date reached (Nov 2026) or API clients migrated |
| PERF-1: Chat widget scrollToBottom effect runs on every messages change | chat-widget.tsx:107-115 | LOW/LOW | rAF deduplication catches redundant calls; micro-optimization | Performance profiling shows bottleneck |
| DOC-1: PATCH route lacks JSDoc for expiryDate | [invitationId]/route.ts | LOW/LOW | Documentation-only; inline comment present | Next documentation cycle |
| DOC-2: Import route dual-path deprecation not in README | migrate/import/route.ts | LOW/LOW | Documentation-only | Next documentation cycle |
