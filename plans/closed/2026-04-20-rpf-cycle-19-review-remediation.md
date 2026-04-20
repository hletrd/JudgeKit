# RPF Cycle 19 Review Remediation Plan

**Date:** 2026-04-20
**Source:** `.context/reviews/rpf-cycle-19-aggregate.md`
**Status:** Priority items pending implementation

## Scope

This cycle addresses the new RPF cycle-19 findings from the multi-agent review:
- AGG-1: Duplicate `formatNumber` in dashboard-judge-system-section.tsx
- AGG-2: Clipboard copy `handleCopyKeyPrefix` silently succeeds on `execCommand` failure
- AGG-3: Scattered number/byte formatting — no single source of truth
- AGG-4: `.toFixed()` used for user-facing numbers — incomplete i18n adoption
- AGG-5: Practice page Path B progress filter still fetches all IDs into memory (carried over from cycle 18)
- AGG-6: Plan status tracking is stale
- AGG-7: `formatNumber` placed in `datetime.ts` — wrong module
- AGG-8: No unit tests for `formatNumber` and `formatBytes` utilities
- AGG-9: `SubmissionListAutoRefresh` polls at fixed intervals without backoff
- AGG-10: `forceNavigate` bypasses Next.js router
- AGG-11: Mobile menu sign-out button touch target below recommended 44px

No RPF cycle-19 review finding is silently dropped. No new refactor-only work is added under deferred.

---

## Implementation lanes

### H1: Consolidate formatting utilities — move `formatNumber` to `formatting.ts`, add `formatBytes`, remove duplicates (AGG-1, AGG-3, AGG-7)

- **Source:** AGG-1, AGG-3, AGG-7
- **Severity / confidence:** MEDIUM / MEDIUM
- **Citations:**
  - `src/lib/datetime.ts:62-67` (formatNumber in wrong module)
  - `src/lib/formatting.ts:1-8` (existing formatting module)
  - `src/app/(dashboard)/dashboard/_components/dashboard-judge-system-section.tsx:5-7` (duplicate formatNumber)
  - `src/app/(dashboard)/dashboard/admin/files/page.tsx:50-54` (formatFileSize)
  - `src/app/(dashboard)/dashboard/admin/settings/database-info.tsx:13-18` (formatBytes)
- **Problem:** Number and byte formatting is spread across 5+ files with no single source of truth. `formatNumber` is in `datetime.ts` (wrong module). Two near-identical byte-formatting functions exist.
- **Plan:**
  1. Move `formatNumber` from `src/lib/datetime.ts` to `src/lib/formatting.ts`.
  2. Re-export `formatNumber` from `datetime.ts` for backward compatibility (update import in `submission-status-badge.tsx` to use `@/lib/formatting`).
  3. Add `formatBytes(value: number, locale?: string): string` to `formatting.ts` using `formatNumber` for locale-aware digit grouping.
  4. Remove local `formatNumber` from `dashboard-judge-system-section.tsx` and import from `@/lib/formatting`.
  5. Replace `formatFileSize` in `admin/files/page.tsx` with `formatBytes` from `@/lib/formatting`.
  6. Replace `formatBytes` in `admin/settings/database-info.tsx` with the shared `formatBytes` from `@/lib/formatting`.
  7. Verify all gates pass.
- **Status:** DONE — commit bbaf21da

### H2: Fix clipboard copy `handleCopyKeyPrefix` error feedback (AGG-2)

- **Source:** AGG-2
- **Severity / confidence:** MEDIUM / MEDIUM
- **Citations:** `src/app/(dashboard)/dashboard/admin/api-keys/api-keys-client.tsx:216-228`
- **Problem:** `handleCopyKeyPrefix` has a `document.execCommand("copy")` fallback but does NOT check its return value or show error feedback. If the fallback fails, the user sees a "copied" toast but nothing was copied.
- **Plan:**
  1. Check the return value of `execCommand("copy")`.
  2. If it returns `false`, show `toast.error(t("copyFailed"))` and return early.
  3. Match the pattern in `copy-code-button.tsx` (fixed in commit 337e306e).
- **Status:** DONE — commit 8879e4b2

### M1: Replace `.toFixed()` in public-facing number displays with locale-aware `formatNumber` (AGG-4)

- **Source:** AGG-4
- **Severity / confidence:** LOW / MEDIUM
- **Citations:**
  - `src/app/(public)/users/[id]/page.tsx:82` (accuracy)
  - `src/app/(public)/_components/public-problem-list.tsx:164` (success rate)
  - `src/app/(public)/practice/problems/[id]/page.tsx:174` (acceptance rate)
  - `src/app/(public)/languages/page.tsx:90` (time limit)
  - `src/app/(public)/practice/page.tsx:688` (difficulty)
  - `src/app/(public)/practice/problems/[id]/page.tsx:368,447` (difficulty)
  - `src/app/(public)/practice/sets/[id]/page.tsx:77` (difficulty)
  - `src/app/(public)/contests/[id]/page.tsx:209` (difficulty)
- **Problem:** 15+ `.toFixed()` calls in public-facing components produce locale-unaware output. The `formatNumber` utility exists but is not adopted.
- **Plan:**
  1. For success rates, accuracy percentages, and acceptance rates: use `formatNumber(value, locale)` with appropriate decimal handling.
  2. For difficulty scores: use `formatNumber(value, locale)` (these are displayed as `toFixed(2).replace(/\.?0+$/, "")` which strips trailing zeros — keep the strip logic but use `formatNumber` for the base formatting).
  3. For time limits and file sizes in public pages: use `formatNumber`.
  4. Note: Server components don't have `useLocale()` — they use `getLocale()` from `next-intl/server`. Pass locale through where needed.
  5. Verify all gates pass.
- **Status:** DONE — commit 4ca86e6c

### M2: Add unit tests for `formatNumber` and `formatBytes` utilities (AGG-8)

- **Source:** AGG-8
- **Severity / confidence:** LOW / MEDIUM
- **Citations:** `src/lib/formatting.ts` (after H1 consolidation)
- **Problem:** Shared formatting utilities have no test coverage.
- **Plan:**
  1. Add tests for `formatNumber`: edge cases (NaN, Infinity, 0, negative, large numbers), locale-specific formatting (en-US, ko-KR).
  2. Add tests for `formatBytes`: boundary values (0 B, 1 KB, 1 MB, 1 GB), locale-specific digit grouping.
  3. Add tests for `formatScore`: edge cases (null, undefined, 0, negative, very large).
- **Status:** DONE — commit f8d879e9

### L1: Archive completed plan files (AGG-6)

- **Source:** AGG-6
- **Severity / confidence:** LOW / HIGH
- **Citations:** Multiple plan files under `plans/open/`
- **Problem:** Several plan files have all items marked DONE but are still in the open directory.
- **Plan:**
  1. Identify all plan files where all priority items are DONE and there are no open deferred items.
  2. Move those files to `plans/closed/` (or an archive directory).
- **Status:** DONE — archived 22+ completed plan files

---

## Deferred items

### DEFER-1: Practice page progress-filter SQL CTE optimization (AGG-5, carried from cycle 18 DEFER-1)

- **Source:** AGG-5 (also rpf-cycle-18 DEFER-1)
- **Severity / confidence:** MEDIUM / MEDIUM
- **Original severity preserved:** MEDIUM / MEDIUM
- **Citations:** `src/app/(public)/practice/page.tsx:410-519`
- **Reason for deferral:** Significant refactoring scope — requires rewriting the progress filter query logic and careful testing. The current code works correctly for existing problem counts. The code already has a comment acknowledging this tech debt. This has been deferred since cycle 18 with no change in circumstances.
- **Exit criterion:** Problem count exceeds 5,000 or a performance benchmark shows >2s page load time with progress filters.

### DEFER-2: `SubmissionListAutoRefresh` polling backoff (AGG-9)

- **Source:** AGG-9
- **Severity / confidence:** LOW / LOW
- **Original severity preserved:** LOW / LOW
- **Citations:** `src/components/submission-list-auto-refresh.tsx:22-28`
- **Reason for deferral:** The auto-refresh component works correctly for normal operation. Adding backoff logic adds complexity for a minor edge case (server overload). The visibility check already prevents unnecessary refreshes when the tab is hidden.
- **Exit criterion:** Users report performance issues during server overload, or a standardized polling pattern with backoff is established across all auto-refresh components.

### DEFER-3: Audit `forceNavigate` call sites (AGG-10)

- **Source:** AGG-10
- **Severity / confidence:** LOW / LOW
- **Original severity preserved:** LOW / LOW
- **Citations:** `src/lib/navigation/client.ts:3-5`
- **Reason for deferral:** `forceNavigate` is used intentionally for cases where Next.js client-side routing is insufficient. An audit would require tracing all call sites and verifying each one. The current usage is not causing issues.
- **Exit criterion:** When a navigation bug is traced to `forceNavigate` being used where `router.push()` would suffice.

### DEFER-4: Mobile sign-out button touch target size (AGG-11)

- **Source:** AGG-11
- **Severity / confidence:** LOW / LOW
- **Original severity preserved:** LOW / LOW
- **Citations:** `src/components/layout/public-header.tsx:318-326`
- **Reason for deferral:** The current touch target (~36px) meets the WCAG 2.2 minimum of 24px. Increasing to the recommended 44px would change the visual layout of the mobile menu. This is a UX refinement, not a bug.
- **Exit criterion:** When a mobile UX audit is performed, or when users report difficulty tapping the sign-out button.

### DEFER-5: Practice page decomposition — extract data module (carried from cycle 18 DEFER-2)

- **Source:** rpf-cycle-18 DEFER-2
- **Severity / confidence:** LOW / MEDIUM
- **Original severity preserved:** LOW / MEDIUM
- **Citations:** `src/app/(public)/practice/page.tsx` (713 lines)
- **Reason for deferral:** Large refactoring scope that should be combined with DEFER-1 (progress filter SQL optimization). Extracting the data module without also fixing the progress filter query would create a module with the same performance issue.
- **Exit criterion:** DEFER-1 is picked up, or the page exceeds 800 lines.

---

## Workspace-to-Public Migration Progress

**Current phase:** Phase 4 — IN PROGRESS
**Next step:** Continue removing redundant dashboard page components and slim down AppSidebar.

Per the user-injected TODO, this cycle should make incremental progress on the workspace-to-public migration. The remaining Phase 4 item is:

> Remove redundant page components under `(dashboard)` where public counterparts exist.

The dashboard rankings, languages, and compiler page directories were already removed in previous cycles. The remaining work is to slim down `AppSidebar` further and potentially merge additional dashboard pages.

### M3: Remove remaining AppSidebar items that duplicate PublicHeader dropdown — continuation of workspace-to-public migration Phase 3

- **Source:** workspace-to-public migration plan Phase 3
- **Severity / confidence:** LOW / MEDIUM
- **Citations:** `src/components/layout/app-sidebar.tsx`
- **Problem:** The AppSidebar still shows items that are already accessible via the PublicHeader dropdown (contests, submissions). Removing these reduces visual clutter and enforces the single-navigation paradigm.
- **Plan:**
  1. Review AppSidebar's current item list.
  2. Remove items that are already in the PublicHeader dropdown.
  3. Ensure the remaining sidebar items are essential dashboard-only navigation.
- **Status:** TODO

---

## Progress log

- 2026-04-20: Plan created from RPF cycle-19 aggregate review.
