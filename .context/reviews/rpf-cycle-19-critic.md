# Critic Review — RPF Cycle 19

**Date:** 2026-04-20
**Reviewer:** critic
**Base commit:** 77da885d

## Findings

### CRI-1: `formatNumber` was added to `datetime.ts` but belongs in a formatting module — module cohesion concern [LOW/MEDIUM]

**Files:** `src/lib/datetime.ts:62-67`
**Description:** The `formatNumber` utility was added to `datetime.ts` which already contains date/time formatting functions. Number formatting is a distinct concern from datetime formatting. Placing it here reduces the module's cohesion and makes it harder to discover. A `formatting.ts` module already exists with `formatScore` — this is where `formatNumber` and `formatBytes` should live.
**Fix:** Move `formatNumber` to `src/lib/formatting.ts` and re-export from `datetime.ts` for backward compatibility during transition.

### CRI-2: Inconsistent `.toFixed()` usage for user-facing numbers undermines i18n investment [LOW/MEDIUM]

**Files:** Multiple public-facing pages (see CR-3 for full list)
**Description:** The team invested effort in creating `formatNumber` for locale-aware number display. However, 15+ `.toFixed()` calls remain in user-facing components (success rates, accuracy, difficulty scores). This creates a mixed experience where some numbers respect locale conventions and others do not. The investment in `formatNumber` is undermined by incomplete adoption.
**Fix:** Systematically replace `.toFixed()` in public-facing components with locale-aware alternatives. At minimum, handle the high-visibility ones: success rates, accuracy percentages, and difficulty scores on public pages.

### CRI-3: Plan status tracking is stale — several plans marked as TODO are already DONE in code [LOW/HIGH]

**Files:** Multiple plan files under `plans/open/`
**Description:** Previous cycles have flagged stale plan statuses (cycle 8 AGG-8, cycle 18 rpf-cycle-18 review). The rpf-cycle-18 remediation plan was created and all items were marked DONE, but older plans may still have inaccurate statuses. This wastes review effort in subsequent cycles when reviewers re-check items that are already resolved.
**Fix:** Do a one-time audit of all open plan files and archive those where all items are DONE.
