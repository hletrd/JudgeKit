# RPF Cycle 16 — Document Specialist

**Date:** 2026-04-20
**Base commit:** 58da97b7

## Findings

### DOC-1: Workspace-to-public migration plan has stale Phase 3/4 status descriptions [LOW/MEDIUM]

- **File:** `plans/open/2026-04-19-workspace-to-public-migration.md:4,195,229`
- **Description:** The plan header says "Phase 4 IN PROGRESS (cycle 23 — control route group merge DONE; remaining: auth-aware public pages, remove remaining dashboard duplicates)" but the detailed Phase 4 section (line 229) says "IN PROGRESS (cycle 23)" without updating for cycle 15 progress (edit button on public problem detail). The Phase 3 remaining work section (line 222-224) still lists "Further slim down AppSidebar" as remaining but doesn't note that the sidebar already has most items removed. The plan is being maintained but not all sections are updated consistently each cycle.
- **Fix:** Update the plan header and Phase 4 status to reflect cycle 15 progress.
- **Confidence:** MEDIUM

### DOC-2: `DROPDOWN_ICONS` in public-header.tsx has no JSDoc linking to `DROPDOWN_ITEM_DEFINITIONS` [LOW/LOW]

- **File:** `src/components/layout/public-header.tsx:58-67`
- **Description:** The `DROPDOWN_ICONS` constant has a comment saying "Must stay aligned with DROPDOWN_ITEM_DEFINITIONS in public-nav.ts" but there is no corresponding JSDoc on `DROPDOWN_ITEM_DEFINITIONS` in `public-nav.ts` that references back to `DROPDOWN_ICONS`. The alignment is one-directional in documentation.
- **Fix:** Add a JSDoc note to `DROPDOWN_ITEM_DEFINITIONS` in `public-nav.ts` referencing `DROPDOWN_ICONS` in `public-header.tsx`.
- **Confidence:** LOW

## Verified Safe

- The `streamBackupWithFiles` JSDoc was correctly updated in rpf-15 L1 to document the `dbNow` parameter.
- The `public-nav.ts` module has clear JSDoc for all exported functions.
- The workspace-to-public migration plan accurately tracks completed work (checkmarks on done items).
