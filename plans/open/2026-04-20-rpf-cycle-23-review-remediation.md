# RPF Cycle 23 Review Remediation Plan

**Date:** 2026-04-20
**Source:** `.context/reviews/cycle-23-aggregate.md`
**Status:** All priority items DONE

## Scope

This cycle addresses the new cycle-23 findings from the multi-agent review:
- AGG-1: `countdown-timer.tsx` uses raw `fetch()` instead of `apiFetch` (last client-side holdout)
- AGG-2: `contest-quick-stats.tsx` silently swallows fetch errors (violates project convention)
- AGG-3: Inconsistent polling patterns across components -- extract shared hook
- AGG-4: AppSidebar "Learning" group has only one item
- AGG-5: Workspace-to-public migration Phase 4 remaining items need enumeration
- AGG-6: No tests for `CountdownTimer` component
- AGG-7: Practice page Path B progress filter (carried from cycle 18, DEFER-1)
- AGG-8: `anti-cheat-monitor.tsx` localStorage is client-controlled (document limitation)

No cycle-23 review finding is silently dropped. No new refactor-only work is added under deferred.

---

## Implementation lanes

### H1: Migrate `countdown-timer.tsx` raw `fetch()` to `apiFetch` (AGG-1)

- **Source:** AGG-1
- **Severity / confidence:** MEDIUM / HIGH
- **Citations:** `src/components/exam/countdown-timer.tsx:76`
- **Problem:** The `CountdownTimer` component calls `fetch("/api/v1/time", ...)` directly instead of using the centralized `apiFetch` wrapper. This is the last remaining client-side raw `fetch()` in a `.tsx` file. While the endpoint is GET (not CSRF-gated), the centralized `apiFetch` wrapper exists for future security enhancements.
- **Plan:**
  1. Import `apiFetch` from `@/lib/api/client` in `countdown-timer.tsx`.
  2. Replace `fetch("/api/v1/time", { signal: controller.signal })` with `apiFetch("/api/v1/time", { signal: controller.signal })`.
  3. Verify all gates pass.
- **Status:** DONE

### M1: Fix `contest-quick-stats.tsx` silent error swallowing (AGG-2)

- **Source:** AGG-2
- **Severity / confidence:** LOW / MEDIUM
- **Citations:** `src/components/contest/contest-quick-stats.tsx:76-78`
- **Problem:** The `fetchStats` callback has a `catch { // ignore }` that violates the documented convention in `src/lib/api/client.ts` which states "Never silently swallow errors -- always surface them to the user."
- **Plan:**
  1. Add `toast.error(t("fetchError"))` in the catch block, matching the pattern in `contest-clarifications.tsx` and `contest-announcements.tsx`.
  2. Verify the `contests` i18n namespace has a `fetchError` key (it likely shares the same namespace as other contest components).
  3. Verify all gates pass.
- **Status:** DONE

### M2: Refactor `leaderboard-table.tsx` polling to visibility-aware pause/resume (AGG-3, partial)

- **Source:** AGG-3
- **Severity / confidence:** MEDIUM / MEDIUM
- **Citations:** `src/components/contest/leaderboard-table.tsx:243-256`
- **Problem:** The leaderboard's `setInterval` continues to fire even when the tab is hidden. It checks visibility inside the callback but does not pause the interval itself. This is inconsistent with 5 other polling components.
- **Plan:**
  1. Refactor the leaderboard's `useEffect` to pause/resume the interval on visibility change, matching the pattern in `contest-clarifications.tsx`.
  2. Note: The full shared `useVisibilityAwarePolling` hook extraction (ARCH-1) is deferred to avoid a large refactor. This item only fixes the inconsistency in the leaderboard component.
  3. Verify all gates pass.
- **Status:** DONE

### M3: Remove AppSidebar "Learning" group label for single-item group (AGG-4)

- **Source:** AGG-4
- **Severity / confidence:** LOW / LOW
- **Citations:** `src/components/layout/app-sidebar.tsx:56-70`
- **Problem:** After the workspace-to-public migration, the "Learning" sidebar group contains only "Problems". A single-item group with a heading label adds visual noise.
- **Plan:**
  1. Change the "Learning" group to have no `labelKey` (remove the group heading) while keeping the "Problems" item.
  2. Verify all gates pass.
- **Status:** PENDING

### M4: Update workspace-to-public migration plan Phase 4 status (AGG-5)

- **Source:** AGG-5
- **Severity / confidence:** INFO / MEDIUM
- **Citations:** `plans/open/2026-04-19-workspace-to-public-migration.md:251-254`
- **Problem:** The migration plan's Phase 4 remaining work is vague about which dashboard page components remain to be removed.
- **Plan:**
  1. Audit remaining dashboard routes against public routes.
  2. Confirm that all dashboard routes with public counterparts have already been redirected (rankings, languages, compiler).
  3. Update the migration plan to enumerate the audit results and mark Phase 4 remaining item as complete or list specific items.
- **Status:** DONE

---

## Deferred items

### DEFER-1: Practice page progress-filter SQL CTE optimization (carried from cycle 18)

- **Source:** rpf-cycle-18 DEFER-1, rpf-cycle-19 DEFER-1, rpf-cycle-20 DEFER-1, rpf-cycle-21 DEFER-1, rpf-cycle-22 DEFER-1
- **Severity / confidence:** MEDIUM / MEDIUM
- **Original severity preserved:** MEDIUM / MEDIUM
- **Citations:** `src/app/(public)/practice/page.tsx:412-449`
- **Reason for deferral:** Significant refactoring scope. Current code works correctly for existing problem counts. Deferred since cycle 18 with no change.
- **Exit criterion:** Problem count exceeds 5,000 or a performance benchmark shows >2s page load time with progress filters.

### DEFER-2: `SubmissionListAutoRefresh` polling backoff (carried from cycle 19)

- **Source:** rpf-cycle-19 DEFER-2, rpf-cycle-20 DEFER-2, rpf-cycle-21 DEFER-2, rpf-cycle-22 DEFER-2
- **Severity / confidence:** LOW / LOW
- **Original severity preserved:** LOW / LOW
- **Citations:** `src/components/submission-list-auto-refresh.tsx:22-28`
- **Reason for deferral:** Works correctly for normal operation. Visibility check prevents unnecessary refreshes.
- **Exit criterion:** Users report performance issues during server overload, or a standardized polling pattern with backoff is established.

### DEFER-3: Audit `forceNavigate` call sites (carried from cycle 19)

- **Source:** rpf-cycle-19 DEFER-3, rpf-cycle-20 DEFER-3, rpf-cycle-21 DEFER-3, rpf-cycle-22 DEFER-3
- **Severity / confidence:** LOW / LOW
- **Original severity preserved:** LOW / LOW
- **Citations:** `src/lib/navigation/client.ts:3-5`
- **Reason for deferral:** `forceNavigate` is used intentionally. Not causing issues.
- **Exit criterion:** When a navigation bug is traced to `forceNavigate` being used where `router.push()` would suffice.

### DEFER-4: Mobile sign-out button touch target size (carried from cycle 19)

- **Source:** rpf-cycle-19 DEFER-4, rpf-cycle-20 DEFER-4, rpf-cycle-21 DEFER-4, rpf-cycle-22 DEFER-4
- **Severity / confidence:** LOW / LOW
- **Original severity preserved:** LOW / LOW
- **Citations:** `src/components/layout/public-header.tsx:318-326`
- **Reason for deferral:** Current touch target (~36px) meets WCAG 2.2 minimum of 24px. UX refinement, not a bug.
- **Exit criterion:** When a mobile UX audit is performed, or when users report difficulty tapping the sign-out button.

### DEFER-5: Practice page decomposition -- extract data module (carried from cycle 18)

- **Source:** rpf-cycle-18 DEFER-2, rpf-cycle-20 DEFER-5, rpf-cycle-21 DEFER-5, rpf-cycle-22 DEFER-5
- **Severity / confidence:** LOW / MEDIUM
- **Original severity preserved:** LOW / MEDIUM
- **Citations:** `src/app/(public)/practice/page.tsx` (716 lines)
- **Reason for deferral:** Should be combined with DEFER-1. Extracting without fixing the query creates same issue in new module.
- **Exit criterion:** DEFER-1 is picked up, or the page exceeds 800 lines.

### DEFER-6: `use-unsaved-changes-guard.ts` uses `window.confirm()` (carried from cycle 20)

- **Source:** rpf-cycle-20 DEFER-6, rpf-cycle-21 DEFER-6, rpf-cycle-22 DEFER-6
- **Severity / confidence:** LOW / MEDIUM
- **Original severity preserved:** LOW / MEDIUM
- **Citations:** `src/hooks/use-unsaved-changes-guard.ts:107`
- **Reason for deferral:** Conventional UX pattern for navigation guards. Replacing with AlertDialog requires significant API changes.
- **Exit criterion:** When a design decision is made to use custom dialogs for all confirmations, or when a reusable async confirmation hook is created.

### DEFER-7: `document.execCommand("copy")` deprecated fallback (carried from cycle 21)

- **Source:** rpf-cycle-21 DEFER-7, rpf-cycle-22 DEFER-7
- **Severity / confidence:** LOW / LOW
- **Original severity preserved:** LOW / LOW
- **Citations:**
  - `src/components/code/copy-code-button.tsx:29`
  - `src/app/(dashboard)/dashboard/admin/api-keys/api-keys-client.tsx:224`
- **Reason for deferral:** The `document.execCommand("copy")` fallback currently works in all major browsers. While deprecated, no browser has removed it yet.
- **Exit criterion:** A major browser removes `execCommand("copy")`, or a shared clipboard utility is implemented across the codebase.

### DEFER-8: `restore/route.ts` `.toFixed(1)` in audit log (carried from cycle 21)

- **Source:** rpf-cycle-21 DEFER-8, rpf-cycle-22 DEFER-8
- **Severity / confidence:** LOW / LOW
- **Original severity preserved:** LOW / LOW
- **Citations:** `src/app/api/v1/admin/restore/route.ts:154-155`
- **Reason for deferral:** Server-side audit log string, not user-facing UI.
- **Exit criterion:** When the formatting module is made server-side compatible, or when audit logs need to be localized.

### DEFER-9: `allImageOptions` rebuilt every render (carried from cycle 21)

- **Source:** rpf-cycle-21 DEFER-9, rpf-cycle-22 DEFER-9
- **Severity / confidence:** LOW / LOW
- **Original severity preserved:** LOW / LOW
- **Citations:** `src/app/(dashboard)/dashboard/admin/languages/language-config-table.tsx:274`
- **Reason for deferral:** The array is small (~15 items) and the sort is trivial.
- **Exit criterion:** When the image options list grows significantly, or when the component is refactored.

### DEFER-10: `use-unsaved-changes-guard.ts` `toHistoryStateValue` unsafe cast (carried from cycle 22)

- **Source:** rpf-cycle-22 DEFER-10
- **Severity / confidence:** LOW / LOW
- **Original severity preserved:** LOW / LOW
- **Citations:** `src/hooks/use-unsaved-changes-guard.ts:37-43`
- **Reason for deferral:** The `as HistoryStateValue` cast is technically unsafe but `window.history.state` is almost always an object or null in practice.
- **Exit criterion:** When a bug is traced to `history.state` being a non-null primitive, or when the hook is refactored to use the Navigation API.

### DEFER-11: Extract shared `useVisibilityAwarePolling` hook (new from cycle 23)

- **Source:** AGG-3 (architect ARCH-1)
- **Severity / confidence:** MEDIUM / MEDIUM
- **Original severity preserved:** MEDIUM / MEDIUM
- **Citations:** 6 components with duplicated polling logic
- **Reason for deferral:** The leaderboard component (M2) will be fixed individually this cycle. A shared hook extraction is a larger refactor that should be done holistically, not piecemeal. M2 provides the immediate consistency fix; the shared hook is the long-term DRY improvement.
- **Exit criterion:** When a cycle has capacity for a focused refactor pass, or when the polling pattern needs a new feature (e.g., exponential backoff).

### DEFER-12: Add unit tests for `CountdownTimer` component (new from cycle 23)

- **Source:** AGG-6 (test-engineer TE-1)
- **Severity / confidence:** LOW / MEDIUM
- **Original severity preserved:** LOW / MEDIUM
- **Citations:** `src/components/exam/countdown-timer.tsx`
- **Reason for deferral:** The component has complex state logic but is working correctly in production. Adding tests is a best-effort improvement, not a bug fix. The apiFetch migration (H1) is the priority.
- **Exit criterion:** When a test-writing cycle has capacity, or when a bug is discovered in the timer logic.

### DEFER-13: `anti-cheat-monitor.tsx` localStorage integrity documentation (new from cycle 23)

- **Source:** AGG-8 (security-reviewer SEC-2)
- **Severity / confidence:** LOW / LOW
- **Original severity preserved:** LOW / LOW
- **Citations:** `src/components/exam/anti-cheat-monitor.tsx:27-46`
- **Reason for deferral:** This is an inherent limitation of client-side anti-cheat. No code change is warranted; documentation is the only action. Server-side detection is the real mitigation.
- **Exit criterion:** When the anti-cheat system undergoes a security review, or when a client asks about tamper-resistance.

---

## Workspace-to-Public Migration Progress

**Current phase:** Phase 4 -- NEARLY COMPLETE

Per the user-injected TODO, this cycle makes incremental progress on the workspace-to-public migration through:

### M4: Audit and update migration plan Phase 4 status

The migration plan's Phase 4 remaining work needs clarification. This cycle will audit the remaining dashboard routes and update the plan.

### Remaining Phase 4 work

1. Confirm all dashboard routes with public counterparts have been redirected (rankings, languages, compiler already done).
2. Evaluate whether AppSidebar "Learning" group can be simplified (M3).
3. Mark Phase 4 as complete if no remaining items exist.

---

## Progress log

- 2026-04-20: Plan created from cycle-23 aggregate review.
- 2026-04-20: H1 (countdown-timer apiFetch migration) DONE.
- 2026-04-20: M1 (contest-quick-stats error feedback) DONE.
- 2026-04-20: M2 (leaderboard visibility-aware polling) DONE.
- 2026-04-20: M3 (AppSidebar Learning group label removal) DONE.
- 2026-04-20: M4 (migration plan Phase 4 status update) DONE.
- 2026-04-20: All priority items implemented. Awaiting deploy.
