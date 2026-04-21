# Verifier — Cycle 24

**Date:** 2026-04-20
**Base commit:** f1b478bc

## Findings

### V-1: Silent error catch blocks may hide stale data from users [MEDIUM/MEDIUM]

**Files:**
- `src/components/lecture/submission-overview.tsx:101-102`
- `src/components/contest/invite-participants.tsx:49-50`
- `src/app/(dashboard)/dashboard/admin/plugins/chat-logs/chat-logs-client.tsx:61-62,75-76`
- `src/app/(dashboard)/dashboard/problems/create/create-problem-form.tsx:223-224`
- `src/components/contest/participant-anti-cheat-timeline.tsx:121`

**Description:** Verified that these catch blocks silently swallow errors, violating the project convention in `src/lib/api/client.ts`. The convention states: "Never silently swallow errors — always surface them to the user." The recently-fixed `contest-quick-stats.tsx` (cycle 23) now shows toast errors, but these similar instances were not fixed.
**Confidence:** MEDIUM

### V-2: Dead `titleKeyByMode` on hidden AppSidebar nav item [LOW/HIGH]

**Files:** `src/components/layout/app-sidebar.tsx:66-67`
**Description:** Verified that `filterItems()` returns `false` for the "Problems" item when `platformMode === "recruiting"` due to `hiddenInModes: ["recruiting"]`. The `titleKeyByMode: { recruiting: "challenges" }` property is unreachable dead code.
**Confidence:** HIGH

## Verified Correct

- All cycle-23 fixes are present and correct: `contest-quick-stats.tsx` shows toast error, `countdown-timer.tsx` uses `apiFetch`, `leaderboard-table.tsx` has visibility-aware polling.
- Phase 4 workspace-to-public migration is complete: no `workspaceHref`, no `/workspace` in robots.ts, no `/workspace` in public-route-seo.ts.
- All Korean letter-spacing violations from the previous cycle-24 review (AGG-4) have been fixed with locale-conditional tracking patterns.
- `AppSidebar` "Learning" group label has been removed (M3 from cycle 23 is DONE).
- `next.config.ts` redirects are correctly configured for all legacy routes.
- All gate checks pass: eslint, tsc --noEmit, vitest.
