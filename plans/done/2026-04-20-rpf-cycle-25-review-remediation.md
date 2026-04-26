# RPF Cycle 25 Review Remediation Plan

**Date:** 2026-04-20
**Source:** `.context/reviews/cycle-25-aggregate.md`
**Status:** In progress

## Scope

This cycle addresses the new cycle-25 findings from the multi-agent review:
- AGG-1: Hardcoded English string "Solved" — ALREADY FIXED (verified)
- AGG-2: Korean `tracking-tight` violations — ALREADY FIXED (verified, all 13 locations)
- AGG-3: `/languages` SEO route matrix — ALREADY FIXED (verified)
- AGG-4: "Languages" top-level nav IA — user-injected TODO, deferred
- AGG-5: `use-unsaved-changes-guard.ts` still uses `window.confirm()` instead of AlertDialog
- AGG-6: `WorkersPageClient` fetchData silently swallows non-OK responses
- AGG-7: `ContestAnnouncements` polling visibility edge case — LOW, accepted as-is

No cycle-25 review finding is silently dropped. No new refactor-only work is added under deferred.

---

## Implementation lanes

### H1: Add error feedback for non-OK API responses in WorkersPageClient (AGG-6)

- **Source:** AGG-6
- **Severity / confidence:** LOW / MEDIUM
- **Citations:** `src/app/(dashboard)/dashboard/admin/workers/workers-client.tsx:223-239`
- **Problem:** `fetchData()` does `if (workersRes.ok)` and `if (statsRes.ok)` but provides no error feedback when responses are not OK. Violates the project convention documented in `src/lib/api/client.ts`: "Never silently swallow errors — always surface them to the user."
- **Plan:**
  1. Add `else` branches for non-OK responses with `toast.error(t("fetchError"))`.
  2. Add a `catch` block with `toast.error(t("fetchError"))` for network errors.
  3. Verify all gates pass.
- **Status:** DONE

### M1: Move "Languages" nav item to footer or secondary position (AGG-4 / user-injected TODO)

- **Source:** AGG-4, user-injected `workspace-to-public-migration.md`
- **Severity / confidence:** MEDIUM / HIGH
- **Citations:** `src/lib/navigation/public-nav.ts:32`
- **Problem:** The "Languages" page is an informational reference page, not a primary action page. Having it at the top level inflates the nav and dilutes information hierarchy. This was previously attempted in cycle 2 (moved to footer) but appears to have been reverted.
- **Plan:**
  1. Move the "Languages" item from `getPublicNavItems()` to the footer or a secondary position.
  2. Keep the `/languages` route accessible and indexed.
  3. Verify the nav is less cluttered and the languages page is still reachable.
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

### DEFER-15: Replace `window.confirm()` in `use-unsaved-changes-guard.ts` with AlertDialog (new from cycle 25, escalated from DEFER-6)

- **Source:** AGG-5 (cycle 25 deep review, designer DES-3), carried from DEFER-6 (cycle 20)
- **Severity / confidence:** MEDIUM / MEDIUM (upgraded from LOW/MEDIUM in previous cycles due to repeated flagging)
- **Original severity preserved:** MEDIUM / MEDIUM (upgraded)
- **Citations:** `src/hooks/use-unsaved-changes-guard.ts:107`
- **Reason for deferral:** The `beforeunload` event handler can only use the native dialog (browser limitation — `event.preventDefault()` + `returnValue` is the only way). For click interception and history navigation, replacing `confirm()` with an async AlertDialog would require significant refactoring of the hook's control flow (navigation must be deferred until the user responds). This is a non-trivial architectural change.
- **Exit criterion:** When a reusable async confirmation hook is created, or when the hook is refactored to use the Navigation API's `navigate` event.

### DEFER-16: `ContestAnnouncements` polling visibility edge case on mount (new from cycle 25)

- **Source:** AGG-7 (cycle 25 perf sweep)
- **Severity / confidence:** LOW / LOW
- **Original severity preserved:** LOW / LOW
- **Citations:** `src/components/contest/contest-announcements.tsx:71-95`
- **Reason for deferral:** The brief timing window (<1ms) where the interval starts before `syncVisibility` checks tab state is harmless in practice. The interval self-corrects immediately on the next visibility check.
- **Exit criterion:** When a shared `useVisibilityAwarePolling` hook (DEFER-11) is implemented that handles this correctly by default.

---

## Workspace-to-Public Migration Progress

**Current phase:** Phase 4 COMPLETE. Next: Phase 5 (Dashboard layout refinement) or remaining items.

Per the user-injected TODO, this cycle makes incremental progress on the workspace-to-public migration. The migration plan is at `plans/open/2026-04-19-workspace-to-public-migration.md`.

### M1 task: Move Languages to secondary position

This directly advances the user-injected TODO and addresses AGG-4. The "Languages" nav item should move from the primary top-level nav to a less prominent position (footer link or secondary navigation), reducing top-level nav clutter and improving information architecture.

---

## Progress log

- 2026-04-20: Plan created from cycle-25 aggregate review.
- 2026-04-20: Verified AGG-1, AGG-2, AGG-3 already fixed in prior cycles.
- 2026-04-20: H1 (WorkersPageClient error feedback) DONE — added toast.error for non-OK responses and catch block, plus i18n keys.
- 2026-04-20: M1 (Languages nav to footer) DONE — removed from top-level nav in public-nav.ts. Footer already has the Languages link.
- 2026-04-20: All priority items implemented. Gates green (eslint 0 errors, tsc --noEmit clean, vitest 294/294 passed, next build success).
