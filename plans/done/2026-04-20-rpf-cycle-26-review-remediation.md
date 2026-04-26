# RPF Cycle 26 Review Remediation Plan

**Date:** 2026-04-20
**Source:** `.context/reviews/cycle-26-aggregate.md`
**Status:** In progress

## Scope

This cycle addresses the cycle-26 findings from the multi-agent review:
- AGG-1: Flaky test — `recruit-page-metadata.test.ts` — ALREADY FIXED (all 4 tests pass)
- AGG-2: ESLint `no-unused-vars` for `_total` destructuring — ALREADY FIXED (eslint config has `destructuredArrayIgnorePattern: "^_"`)
- AGG-3: Recruit page duplicate DB query — ALREADY FIXED (`React.cache()` deduplication in place)
- AGG-4: Contest join `tracking-[0.35em]` on access code — ALREADY ADDRESSED (documentation comment added, font-mono alphanumeric safe for Korean)

No cycle-26 review finding is silently dropped. No new refactor-only work is added under deferred.

---

## Implementation lanes

### H1: (No new HIGH-severity items — all cycle-26 findings pre-resolved)

All 4 findings from the cycle-26 aggregate were already fixed or addressed in prior cycles. No new HIGH-priority implementation needed.

### M1: Continue workspace-to-public migration — AppSidebar slim-down (Phase 5)

- **Source:** User-injected TODO, carried from Phase 3 remaining work
- **Severity / confidence:** MEDIUM / HIGH
- **Citations:** `src/components/layout/app-sidebar.tsx`, `plans/open/2026-04-19-workspace-to-public-migration.md`
- **Problem:** The AppSidebar still renders a full sidebar with labeled groups. After the migration, the sidebar only has 3 non-admin items (Problems, Groups, Problem Sets) plus the admin sections. The "Learning" group has been reduced to just "Problems" with no label. The sidebar takes up significant screen real estate for only a few navigation items.
- **Plan:**
  1. Evaluate whether the remaining non-admin sidebar items (Problems, Groups, Problem Sets) can be moved to the PublicHeader dropdown or another location, allowing the sidebar to be collapsed by default or hidden entirely for non-admin users.
  2. For admin users, keep the sidebar but consider making it collapsible to an icon-rail mode.
  3. Ensure the "Problems" item in the PublicHeader dropdown is visible to all authenticated users (not just `problems.create` capability) since the sidebar currently shows it to everyone.
  4. Verify all gates pass.
- **Status:** DONE

---

## Deferred items

### DEFER-1 through DEFER-13: Carried from cycle 23

See `plans/open/2026-04-20-rpf-cycle-23-review-remediation.md` for the full deferred list. All carry forward unchanged.

### DEFER-14: Centralized error handling pattern / useApiFetch hook (carried from cycle 24)

- **Source:** AGG-5 (architect ARCH-3, document-specialist DOC-1)
- **Severity / confidence:** MEDIUM / MEDIUM
- **Original severity preserved:** MEDIUM / MEDIUM
- **Citations:** Cross-cutting: `src/lib/api/client.ts`, all components using apiFetch
- **Reason for deferral:** The immediate fixes (H1) address the symptom. A centralized `useApiFetch` hook or ESLint rule is a larger refactor that should be done holistically, not piecemeal. H1 provides the immediate fixes; the shared hook is the long-term DRY improvement.
- **Exit criterion:** When a cycle has capacity for a focused refactor pass, or when a new catch-block pattern violation is found.

### DEFER-15: Replace `window.confirm()` in `use-unsaved-changes-guard.ts` with AlertDialog (carried from cycle 25)

- **Source:** AGG-5 (cycle 25 deep review, designer DES-3), carried from DEFER-6 (cycle 20)
- **Severity / confidence:** MEDIUM / MEDIUM (upgraded from LOW/MEDIUM)
- **Original severity preserved:** MEDIUM / MEDIUM (upgraded)
- **Citations:** `src/hooks/use-unsaved-changes-guard.ts:107`
- **Reason for deferral:** The `beforeunload` event handler can only use the native dialog (browser limitation). For click interception and history navigation, replacing `confirm()` with an async AlertDialog would require significant refactoring of the hook's control flow.
- **Exit criterion:** When a reusable async confirmation hook is created, or when the hook is refactored to use the Navigation API's `navigate` event.

### DEFER-16: `ContestAnnouncements` polling visibility edge case on mount (carried from cycle 25)

- **Source:** AGG-7 (cycle 25 perf sweep)
- **Severity / confidence:** LOW / LOW
- **Original severity preserved:** LOW / LOW
- **Citations:** `src/components/contest/contest-announcements.tsx:71-95`
- **Reason for deferral:** The brief timing window (<1ms) where the interval starts before `syncVisibility` checks tab state is harmless in practice.
- **Exit criterion:** When a shared `useVisibilityAwarePolling` hook (DEFER-11) is implemented.

---

## Workspace-to-Public Migration Progress

**Current phase:** Phase 4 COMPLETE. Working on Phase 5 (AppSidebar slim-down).

Per the user-injected TODO, this cycle makes incremental progress on the workspace-to-public migration through M1.

### Phase 5 — AppSidebar slim-down / contextual navigation

**Goal:** Reduce the AppSidebar's visual footprint for non-admin users by moving remaining items to the PublicHeader dropdown.

**Current AppSidebar non-admin items:**
- Problems (visible to all authenticated users)
- Groups (visible to all, but hidden in recruiting mode)
- Problem Sets (requires `problem_sets.create` capability)

**Current PublicHeader dropdown items:**
- Dashboard, Problems (`problems.create`), Problem Sets (`problem_sets.create`), Groups (`groups.view_all`), My Submissions, Contests, Profile, Admin (`system.settings`)

**Observation:** The sidebar's "Problems" item is visible to ALL authenticated users (no capability gate), while the dropdown's "Problems" requires `problems.create`. This means students can see "Problems" in the sidebar but not in the dropdown. We need to make "Problems" visible to all authenticated users in the dropdown too.

**Plan:**
1. Remove the `capability: "problems.create"` gate from the "Problems" dropdown item so it's visible to all authenticated users (matching the sidebar behavior).
2. Move "Groups" to be visible to all authenticated users (not just `groups.view_all`), since the sidebar currently shows it to everyone. The `groups.view_all` capability only affects whether ALL groups or just the user's groups are visible — the nav item itself should be available to all.
3. Evaluate removing the AppSidebar entirely for non-admin users (users without any admin capability), since all their nav items would then be in the PublicHeader dropdown.
4. For admin users, the sidebar remains essential for the 14 admin items, but could default to collapsed (icon-rail) mode.

---

## Progress log

- 2026-04-20: Plan created from cycle-26 aggregate review. All 4 findings already fixed/resolved.
- 2026-04-20: M1 (AppSidebar slim-down) DONE — removed capability gates from Problems/Groups dropdown items, hid sidebar for non-admin users.
- 2026-04-20: Updated workspace-to-public migration plan with Phase 5 status.
- 2026-04-20: All gates green (eslint 0 errors, tsc --noEmit clean, vitest 294/294 passed, next build success).
- 2026-04-20: Additional cleanup — removed non-admin nav items from AppSidebar (navGroups constant), dead code in filterItems(), unused imports. Updated capability test to check PublicHeader dropdown instead.
- 2026-04-20: All gates green after cleanup (eslint, tsc, vitest 294/294, next build).
