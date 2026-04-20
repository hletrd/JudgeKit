# RPF Cycle 16 Review Remediation Plan

**Date:** 2026-04-20
**Source:** `.context/reviews/rpf-16-aggregate.md` and per-agent review files

---

## Scope

This cycle addresses the new rpf-16 findings from the multi-agent review:
- AGG-1: Bulk recruiting invitations route missing `expiryDateInPast` validation [MEDIUM/HIGH]
- AGG-2: Unhandled `navigator.clipboard.writeText()` in multiple client components [LOW/MEDIUM]
- AGG-3: Copy-feedback `setTimeout` not tracked/cleaned up on unmount [LOW/LOW]
- AGG-4: Public problem detail "Rankings" button uses hardcoded English label [LOW/MEDIUM]
- AGG-5: Mobile menu dropdown items lack icons [LOW/LOW]
- AGG-6: Public problem detail page sequential DB queries [MEDIUM/MEDIUM]
- AGG-7: `streamBackupWithFiles` memory buffering (carry from rpf-13/14/15) [MEDIUM/HIGH]
- AGG-8: Workspace-to-public migration plan status stale [LOW/MEDIUM]
- AGG-9: `DROPDOWN_ICONS` / `DROPDOWN_ITEM_DEFINITIONS` documentation one-directional [LOW/LOW]

Plus the user-injected architectural directive: incremental progress on workspace-to-public migration.

No rpf-16 review finding is silently dropped. No new refactor-only work is added under deferred.

---

## Implementation lanes

### H1: Add `expiryDateInPast` validation to bulk recruiting invitations route (AGG-1)

- **Source:** AGG-1
- **Severity / confidence:** MEDIUM / HIGH
- **Citations:** `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/bulk/route.ts:62-68`
- **Problem:** The bulk route validates the upper bound of `expiryDate` (`expiryDateTooFar`) but does not validate that the computed `expiresAt` is in the future. The single-create and PATCH routes both reject past dates. 7 of 11 agents flagged this.
- **Plan:**
  1. In `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/bulk/route.ts`, after computing `expiresAt` from `expiryDate` (line 63), add:
     ```typescript
     if (expiresAt <= dbNow) {
       throw new Error("expiryDateInPast");
     }
     ```
  2. Add the `expiryDateInPast` error handler in the catch block (alongside `emailAlreadyInvited` and `expiryDateTooFar`)
  3. Verify tsc --noEmit passes
  4. Verify existing tests pass
- **Status:** DONE

### M1: Add try/catch to unhandled clipboard operations (AGG-2)

- **Source:** AGG-2
- **Severity / confidence:** LOW / MEDIUM
- **Citations:** `workers-client.tsx:168-171`, `file-management-client.tsx:90-96`, `recruiting-invitations-panel.tsx:308-312`
- **Problem:** Several clipboard operations lack try/catch while others in the same codebase have it. The rpf-15 M1 fix was applied too narrowly. 8 of 11 agents flagged this (partially or fully).
- **Plan:**
  1. In `workers-client.tsx`: Make `copyToClipboard` async, await clipboard, wrap in try/catch with error toast
  2. In `file-management-client.tsx`: Wrap `navigator.clipboard.writeText(url)` in try/catch with error toast
  3. In `recruiting-invitations-panel.tsx`: Wrap the inline onClick clipboard call in try/catch with error toast
  4. Verify all three components compile
- **Status:** DONE

### M2: Track copy-feedback timers with refs (AGG-3)

- **Source:** AGG-3
- **Severity / confidence:** LOW / LOW
- **Citations:** `file-management-client.tsx:95`, `access-code-manager.tsx:48`
- **Problem:** Untracked `setTimeout` calls that set state can fire after unmount. Same pattern was fixed in recruiting invitations panel (rpf-15 M2) but other components were missed. 3 of 11 agents flagged this.
- **Plan:**
  1. In `file-management-client.tsx`: Add a `copiedIdTimer` ref, track the timeout, add cleanup useEffect
  2. In `access-code-manager.tsx`: Add a `copiedTimer` ref, track the timeout, add cleanup useEffect
  3. Verify both components compile
- **Status:** DONE

### M3: Replace hardcoded "Rankings" label with i18n key (AGG-4)

- **Source:** AGG-4
- **Severity / confidence:** LOW / MEDIUM
- **Citations:** `src/app/(public)/practice/problems/[id]/page.tsx:400`
- **Problem:** The "Rankings" button uses a hardcoded English string. All other labels on the page use i18n. Will show "Rankings" in English even in Korean locale.
- **Plan:**
  1. Add i18n key `viewRankings` (or use existing `rankings` key) in `messages/en.json` and `messages/ko.json`
  2. Replace `Rankings` with `t("practice.viewRankings")` or equivalent
  3. Verify Korean rendering does not use custom letter-spacing
- **Status:** DONE

### L1: Add dropdown icons to mobile menu (AGG-5)

- **Source:** AGG-5
- **Severity / confidence:** LOW / LOW
- **Citations:** `src/components/layout/public-header.tsx:305-314`
- **Problem:** Mobile menu dropdown items lack icons that are shown in the desktop dropdown. Inconsistent experience.
- **Plan:**
  1. Add `{DROPDOWN_ICONS[item.href]}` to the mobile panel's dropdown items at line 312
  2. Verify icons render correctly on mobile
- **Status:** N/A — false positive; mobile menu already renders DROPDOWN_ICONS at line 312

### L2: Add bidirectional JSDoc between DROPDOWN_ICONS and DROPDOWN_ITEM_DEFINITIONS (AGG-9)

- **Source:** AGG-9
- **Severity / confidence:** LOW / LOW
- **Citations:** `src/lib/navigation/public-nav.ts:57`, `src/components/layout/public-header.tsx:58-67`
- **Problem:** Documentation is one-directional — `DROPDOWN_ICONS` references `DROPDOWN_ITEM_DEFINITIONS` but not vice versa.
- **Plan:**
  1. Add a JSDoc note to `DROPDOWN_ITEM_DEFINITIONS` in `public-nav.ts` referencing `DROPDOWN_ICONS` in `public-header.tsx`
- **Status:** DONE

### L3: Update workspace-to-public migration plan status (AGG-8)

- **Source:** AGG-8
- **Severity / confidence:** LOW / MEDIUM
- **Citations:** `plans/open/2026-04-19-workspace-to-public-migration.md`
- **Problem:** Plan header and Phase 4 section don't reflect cycle 15 progress.
- **Plan:**
  1. Update the plan header to note cycle 16 progress
  2. Update Phase 4 remaining work with current state
- **Status:** DONE

---

## Workspace-to-public migration (user-injected directive)

### W1: Add "Problem Sets" link to PublicHeader dropdown for users with capability

- **Source:** User-injected workspace-to-public-migration.md (Phase 4, incremental progress)
- **Priority:** MEDIUM
- **Problem:** The AppSidebar has a "Problem Sets" link gated behind `problem_sets.create` capability, but the PublicHeader dropdown does not include it. Users who access the app primarily through the public navbar (the target state) have no way to reach problem sets from the top nav.
- **Plan:**
  1. Add `{ href: "/dashboard/problem-sets", label: "problemSets", capability: "problem_sets.create" }` to `DROPDOWN_ITEM_DEFINITIONS` in `src/lib/navigation/public-nav.ts`
  2. Add `DROPDOWN_ICONS` entry for `/dashboard/problem-sets` in `src/components/layout/public-header.tsx` (use `FolderOpen` icon, matching AppSidebar)
  3. Add i18n key `nav.problemSets` to `messages/en.json` and `messages/ko.json` if not already present
  4. Verify the dropdown item appears for users with `problem_sets.create` capability
  5. Verify Korean label does not use custom letter-spacing
- **Status:** DONE

---

## Deferred items

### DEFER-1: Audit events failure tracker `new Date()` for `lastAuditEventWriteFailureAt` (carried from rpf-11)

- **Source:** AGG-4 (rpf-11)
- **Severity / confidence:** LOW / LOW
- **Citations:** `src/lib/audit/events.ts:117`
- **Original severity preserved:** LOW / LOW
- **Reason for deferral:** Purely diagnostic output. Not used for comparison, access control, or data integrity. Replacing with `getDbNowUncached()` would require making the flush path async-aware.
- **Exit criterion:** When the audit events module is next refactored, or when a developer reports diagnostic timestamp confusion.

### DEFER-2: `streamBackupWithFiles` memory buffering architecture (AGG-7, carried from rpf-13, rpf-14, rpf-15, rpf-16)

- **Source:** AGG-7 (rpf-16), AGG-6 (rpf-13, rpf-14, rpf-15)
- **Severity / confidence:** MEDIUM / HIGH
- **Citations:** `src/lib/db/export-with-files.ts:112-182`
- **Original severity preserved:** MEDIUM / HIGH
- **Reason for deferral:** Architectural limitation of JSZip (non-streaming). Migrating to a streaming ZIP library is a significant refactor. Current approach works for small/medium databases. Short-term mitigation (warning log for large exports) not yet implemented but also low urgency.
- **Exit criterion:** When a database reaches a size where memory pressure during backup becomes a production issue, or when a dedicated backup infrastructure cycle is scheduled.

### DEFER-3: Health endpoint timestamps using `new Date()` (carried from rpf-13)

- **Source:** CR-5, CR-6 (code-reviewer, rpf-13)
- **Severity / confidence:** LOW / LOW
- **Citations:** `src/lib/ops/admin-health.ts:53`, `src/app/api/v1/health/route.ts:31`
- **Original severity preserved:** LOW / LOW
- **Reason for deferral:** Diagnostic timestamps that should reflect "when this health check ran" from the app server's perspective. Adding a DB round-trip to every health check is counterproductive.
- **Exit criterion:** When a monitoring system requires DB-synchronized health check timestamps.

### DEFER-4: `document.execCommand("copy")` deprecation (carried from rpf-14)

- **Source:** CR-7 (code-reviewer)
- **Severity / confidence:** LOW / LOW
- **Citations:** `src/components/code/copy-code-button.tsx:28`, `src/app/(dashboard)/dashboard/admin/api-keys/api-keys-client.tsx:220`
- **Original severity preserved:** LOW / LOW
- **Reason for deferral:** `document.execCommand("copy")` is deprecated but still functional in all major browsers. It's used only as a fallback when `navigator.clipboard.writeText()` fails. No browser has announced removal timeline yet.
- **Exit criterion:** When a major browser removes support for `document.execCommand("copy")`, or when a dedicated UI modernization cycle is scheduled.

### DEFER-5: Redundant `new Date()` in `database-backup-restore.tsx` fallback path (carried from rpf-15)

- **Source:** CR-5 (code-reviewer, rpf-15)
- **Severity / confidence:** LOW / LOW
- **Citations:** `src/app/(dashboard)/dashboard/admin/settings/database-backup-restore.tsx:60`
- **Original severity preserved:** LOW / LOW
- **Reason for deferral:** Only used as a fallback when the server-provided `Content-Disposition` filename is missing. In degraded mode, client-side timestamp is the best available option.
- **Exit criterion:** When the server always provides `Content-Disposition` headers (confirmed by removing the fallback path).

### DEFER-6: Public problem detail page sequential DB queries (AGG-6)

- **Source:** AGG-6 (rpf-16)
- **Severity / confidence:** MEDIUM / MEDIUM
- **Citations:** `src/app/(public)/practice/problems/[id]/page.tsx:111-213`
- **Original severity preserved:** MEDIUM / MEDIUM
- **Reason for deferral:** Performance optimization, not a correctness issue. The sequential queries are functionally correct. Parallelizing them requires careful analysis of data dependencies and could increase peak DB connection usage. The page loads reasonably fast for typical data sizes.
- **Exit criterion:** When page load time measurements show the problem detail page exceeds a performance budget (e.g., >500ms TTFB), or when a dedicated performance optimization cycle is scheduled.

---

## Progress log

- 2026-04-20: Plan created from rpf-16 aggregate review. 9 findings, 7 scheduled for implementation (H1, M1, M2, M3, L1, L2, L3), 1 carry-over deferred (AGG-7/DEFER-2), 1 new deferred (AGG-6/DEFER-6). Plus 1 workspace-to-public migration item (W1). Previous DEFER-1 through DEFER-5 carried forward.
- 2026-04-20: All scheduled items implemented. H1 (expiryDateInPast in bulk route), M1 (clipboard error handling), M2 (timer cleanup), M3 (i18n Rankings label), L1 (false positive — icons already present), L2 (bidirectional JSDoc), L3 (plan status update), W1 (Problem Sets in dropdown). All gates green.
