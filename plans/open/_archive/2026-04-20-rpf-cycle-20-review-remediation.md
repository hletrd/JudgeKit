# RPF Cycle 20 Review Remediation Plan

**Date:** 2026-04-20
**Source:** `.context/reviews/_aggregate.md` (cycle 20)
**Status:** Priority items pending implementation

## Scope

This cycle addresses the new cycle-20 findings from the multi-agent review:
- AGG-1: Duplicate `formatDifficultyValue` in dashboard pages -- not using shared formatting utilities
- AGG-2: `recruiting-invitations-panel.tsx` silently ignores clipboard failure on create
- AGG-3: `language-config-table.tsx` uses native `confirm()` for 4 destructive operations
- AGG-4: Remaining `.toFixed()` uses in dashboard/admin pages -- incomplete i18n adoption
- AGG-5: Practice page Path B progress filter still fetches all IDs into memory (carried from cycle 18)
- AGG-6: Stale deferred items accumulating across cycles
- AGG-7: `use-unsaved-changes-guard.ts` uses `window.confirm()` (navigation guard)
- AGG-8: `formatDifficulty` helper has no unit test coverage

No cycle-20 review finding is silently dropped. No new refactor-only work is added under deferred.

---

## Implementation lanes

### H1: Add `formatDifficulty` to shared formatting module and replace duplicates (AGG-1, AGG-8)

- **Source:** AGG-1, AGG-8
- **Severity / confidence:** MEDIUM / MEDIUM
- **Citations:**
  - `src/app/(dashboard)/dashboard/problems/[id]/page.tsx:31-33` (local formatDifficultyValue)
  - `src/app/(dashboard)/dashboard/problems/page.tsx:70-72` (local formatDifficultyValue)
  - `src/app/(public)/practice/page.tsx:689` (inline formatNumber + replace)
  - `src/lib/formatting.ts` (shared module)
- **Problem:** Two identical `formatDifficultyValue` functions exist in dashboard pages using `.toFixed(2).replace()`. The public pages use `formatNumber` with `maximumFractionDigits: 2` and `.replace()`. The dashboard and public pages produce different output for the same value (e.g., "1234.5" vs "1,234.5" for en-US).
- **Plan:**
  1. Add `formatDifficulty(value: number, locale?: string | string[]): string` to `src/lib/formatting.ts`. Implementation: `formatNumber(value, { locale, maximumFractionDigits: 2 }).replace(/\.?0+$/, "")`.
  2. Replace local `formatDifficultyValue` in `src/app/(dashboard)/dashboard/problems/[id]/page.tsx` with import from `@/lib/formatting`.
  3. Replace local `formatDifficultyValue` in `src/app/(dashboard)/dashboard/problems/page.tsx` with import from `@/lib/formatting`.
  4. Replace the inline `formatNumber(...).replace(...)` pattern in `src/app/(public)/practice/page.tsx` and other public pages that format difficulty.
  5. Add unit tests for `formatDifficulty`: edge cases (0, negative, large numbers, locale-specific formatting, trailing zero stripping).
  6. Verify all gates pass.
- **Status:** DONE — commit e98a97a3

### H2: Fix silent clipboard failure in recruiting invitations create flow (AGG-2)

- **Source:** AGG-2
- **Severity / confidence:** MEDIUM / MEDIUM
- **Citations:** `src/components/contest/recruiting-invitations-panel.tsx:183`
- **Problem:** When creating an invitation, the code does `try { await navigator.clipboard.writeText(link); } catch { /* ignore */ }`. The `handleCopyLink` function at line 209 properly shows an error toast on failure, but the create flow does not. This is the exact same pattern that was fixed in `api-keys-client.tsx` (AGG-2 from cycle 19) and `copy-code-button.tsx`.
- **Plan:**
  1. Replace `catch { /* ignore */ }` at line 183 with `catch { toast.error(t("copyError")); }`.
  2. Verify that the `copyError` i18n key exists (it's used by `handleCopyLink` at line 210, so it should).
  3. Verify all gates pass.
- **Status:** DONE — commit e59d62f1

### M1: Replace native `confirm()` with `AlertDialog` in language config table (AGG-3)

- **Source:** AGG-3
- **Severity / confidence:** MEDIUM / MEDIUM
- **Citations:** `src/app/(dashboard)/dashboard/admin/languages/language-config-table.tsx:115,134,195,209`
- **Problem:** Four destructive operations (remove image, prune, reset language, reset all) use native `window.confirm()`. The `access-code-manager.tsx` was already migrated to `AlertDialog` (commit 39fa5456). Native `confirm()` blocks the main thread, is not themeable, and breaks the visual design language.
- **Plan:**
  1. Add `AlertDialog` component state (similar to `access-code-manager.tsx`).
  2. Replace `confirm(t("actions.removeConfirm"))` with AlertDialog for `handleRemoveImage`.
  3. Replace `confirm(t("actions.pruneConfirm"))` with AlertDialog for `handlePrune`.
  4. Replace `confirm(t("edit.resetConfirm"))` with AlertDialog for `handleReset`.
  5. Replace `confirm(t("actions.resetAllConfirm"))` with AlertDialog for `handleResetAll`.
  6. Verify all gates pass.
- **Status:** DONE — commit 74f5c85d

### M2: Replace remaining `.toFixed()` uses in dashboard/admin pages with shared formatting utilities (AGG-4)

- **Source:** AGG-4
- **Severity / confidence:** LOW / LOW
- **Citations:**
  - `src/app/(dashboard)/dashboard/problems/create/create-problem-form.tsx:872,913` -- KB display
  - `src/lib/system-info.ts:62` -- GHz display
  - `src/components/code/compiler-client.tsx:111` -- KB display
  - `src/components/layout/active-timed-assignment-sidebar-panel.tsx:152` -- progress percent
- **Problem:** Several `.toFixed()` calls remain in dashboard/admin pages. These should use `formatNumber` or `formatBytes` from the shared module for locale consistency.
- **Plan:**
  1. In `create-problem-form.tsx`: replace `(x / 1024).toFixed(1)` with `formatBytes(x)` from `@/lib/formatting`.
  2. In `system-info.ts`: replace `(speedMHz / 1000).toFixed(1)` with `formatNumber(speedMHz / 1000, { maximumFractionDigits: 1 })`.
  3. In `compiler-client.tsx`: replace `(content.length / 1024).toFixed(1)` with `formatBytes(content.length)` from `@/lib/formatting`.
  4. In `active-timed-assignment-sidebar-panel.tsx`: replace `progressPercent.toFixed(1)` with `formatNumber(progressPercent, { maximumFractionDigits: 1 })`.
  5. Verify all gates pass.
- **Status:** DONE — commit f7fdbb00

---

## Deferred items

### DEFER-1: Practice page progress-filter SQL CTE optimization (AGG-5, carried from cycle 18)

- **Source:** AGG-5 (also rpf-cycle-18 DEFER-1, rpf-cycle-19 DEFER-1)
- **Severity / confidence:** MEDIUM / MEDIUM
- **Original severity preserved:** MEDIUM / MEDIUM
- **Citations:** `src/app/(public)/practice/page.tsx:410-519`
- **Reason for deferral:** Significant refactoring scope -- requires rewriting the progress filter query logic and careful testing. The current code works correctly for existing problem counts. The code already has a comment acknowledging this tech debt. This has been deferred since cycle 18 with no change in circumstances.
- **Exit criterion:** Problem count exceeds 5,000 or a performance benchmark shows >2s page load time with progress filters.

### DEFER-2: `SubmissionListAutoRefresh` polling backoff (carried from cycle 19)

- **Source:** rpf-cycle-19 DEFER-2
- **Severity / confidence:** LOW / LOW
- **Original severity preserved:** LOW / LOW
- **Citations:** `src/components/submission-list-auto-refresh.tsx:22-28`
- **Reason for deferral:** The auto-refresh component works correctly for normal operation. Adding backoff logic adds complexity for a minor edge case (server overload). The visibility check already prevents unnecessary refreshes when the tab is hidden.
- **Exit criterion:** Users report performance issues during server overload, or a standardized polling pattern with backoff is established across all auto-refresh components.

### DEFER-3: Audit `forceNavigate` call sites (carried from cycle 19)

- **Source:** rpf-cycle-19 DEFER-3
- **Severity / confidence:** LOW / LOW
- **Original severity preserved:** LOW / LOW
- **Citations:** `src/lib/navigation/client.ts:3-5`
- **Reason for deferral:** `forceNavigate` is used intentionally for cases where Next.js client-side routing is insufficient. An audit would require tracing all call sites and verifying each one. The current usage is not causing issues.
- **Exit criterion:** When a navigation bug is traced to `forceNavigate` being used where `router.push()` would suffice.

### DEFER-4: Mobile sign-out button touch target size (carried from cycle 19)

- **Source:** rpf-cycle-19 DEFER-4
- **Severity / confidence:** LOW / LOW
- **Original severity preserved:** LOW / LOW
- **Citations:** `src/components/layout/public-header.tsx:318-326`
- **Reason for deferral:** The current touch target (~36px) meets the WCAG 2.2 minimum of 24px. Increasing to the recommended 44px would change the visual layout of the mobile menu. This is a UX refinement, not a bug.
- **Exit criterion:** When a mobile UX audit is performed, or when users report difficulty tapping the sign-out button.

### DEFER-5: Practice page decomposition -- extract data module (carried from cycle 18)

- **Source:** rpf-cycle-18 DEFER-2
- **Severity / confidence:** LOW / MEDIUM
- **Original severity preserved:** LOW / MEDIUM
- **Citations:** `src/app/(public)/practice/page.tsx` (716 lines)
- **Reason for deferral:** Large refactoring scope that should be combined with DEFER-1 (progress filter SQL optimization). Extracting the data module without also fixing the progress filter query would create a module with the same performance issue.
- **Exit criterion:** DEFER-1 is picked up, or the page exceeds 800 lines.

### DEFER-6: `use-unsaved-changes-guard.ts` uses `window.confirm()` (AGG-7)

- **Source:** AGG-7
- **Severity / confidence:** LOW / MEDIUM
- **Original severity preserved:** LOW / MEDIUM
- **Citations:** `src/hooks/use-unsaved-changes-guard.ts:107`
- **Reason for deferral:** The unsaved changes guard uses `window.confirm()` which is a conventional UX pattern for beforeunload-style navigation guards. Replacing it with `AlertDialog` would require significant changes to the hook's synchronous API (it currently returns a boolean synchronously to work with Next.js route blockers). This is a different UX context than the action confirmations in AGG-3. The native dialog is actually expected behavior for navigation guards in most web applications.
- **Exit criterion:** When a design decision is made to use custom dialogs for all confirmations, or when a reusable async confirmation hook is created.

---

## Workspace-to-Public Migration Progress

**Current phase:** Phase 4 -- IN PROGRESS
**Next step:** Continue removing redundant dashboard page components and slim down AppSidebar.

Per the user-injected TODO, this cycle should make incremental progress on the workspace-to-public migration. The remaining Phase 4 items are:

> Remove redundant page components under `(dashboard)` where public counterparts exist.

The dashboard rankings, languages, and compiler page directories were already removed in previous cycles. The remaining work is to slim down `AppSidebar` further.

### M3: Remove "submissions" from AppSidebar -- already accessible via PublicHeader dropdown

- **Source:** workspace-to-public migration plan Phase 3
- **Severity / confidence:** LOW / MEDIUM
- **Citations:** `src/components/layout/app-sidebar.tsx:69-72`
- **Problem:** The AppSidebar still shows "submissions" (href: `/dashboard/submissions`) which is already accessible via the PublicHeader dropdown ("My Submissions"). Removing this reduces visual clutter and enforces the single-navigation paradigm.
- **Plan:**
  1. Remove the `submissions` item from the `navGroups[0].items` array in AppSidebar.
  2. Verify that submissions is still accessible from the PublicHeader dropdown.
  3. Verify all gates pass.
- **Status:** DONE — commit 73fbe539

---

## Progress log

- 2026-04-20: Plan created from cycle-20 aggregate review.
- 2026-04-20: Archived completed plans (cycle-22, cycle-23, cycle-27, rpf-cycle-16, rpf-cycle-19).
- 2026-04-20: H1 DONE — added formatDifficulty to formatting.ts, replaced duplicates in 2 dashboard + 5 public pages, added 12 unit tests.
- 2026-04-20: H2 DONE — added error feedback to recruiting invitations create clipboard catch block.
- 2026-04-20: M1 DONE — replaced 4 confirm() calls with AlertDialog in language-config-table.
- 2026-04-20: M2 DONE — replaced .toFixed() with formatBytes/formatNumber in 4 files.
- 2026-04-20: M3 DONE — removed submissions from AppSidebar (already in PublicHeader dropdown).
