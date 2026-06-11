# Cycle 23 Designer Review

**Date:** 2026-04-20
**Base commit:** bb6f3fc2

## Findings

### DES-1: AppSidebar "Learning" group with single item creates visual imbalance [LOW/LOW]

**Files:** `src/components/layout/app-sidebar.tsx:56-70`
**Description:** After the workspace-to-public migration removed Submissions, Contests, Rankings, and Compiler from the sidebar, the "Learning" section contains only "Problems". A sidebar group heading for a single item creates visual noise. The "Manage" section has two items (Groups, Problem Sets) and still makes sense as a group. The "Learning" section looks orphaned.
**Fix:** Remove the "Learning" group label or merge into "Manage".
**Confidence:** LOW

### DES-2: Mobile sign-out button touch target (carried from cycle 19 DEFER-4) [LOW/LOW]

**Files:** `src/components/layout/public-header.tsx:318-326`
**Description:** This is a carried-forward finding. The mobile sign-out button touch target (~36px) meets WCAG 2.2 minimum of 24px but does not meet the recommended 44x44px target size from WCAG 2.2 Success Criterion 2.5.8 (Target Size - Level AAA). No change this cycle.
**Confidence:** LOW

## Verified Safe

- Korean letter-spacing is correctly conditional throughout all components.
- PublicHeader mobile menu has proper focus management (focus trap, Escape to close, focus restoration).
- Screen reader announcements for mobile menu state use `aria-live="polite"`.
- `countdown-timer.tsx` threshold announcements use `aria-live="assertive"`.
- Sticky header columns in leaderboard table use proper z-index layering.
