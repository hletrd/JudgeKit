# Cycle 8 Architect Review

**Date:** 2026-04-20
**Reviewer:** architect
**Base commit:** ddffef18

## Findings

### ARCH-1: Incomplete `new Date()` → `getDbNowUncached()` migration — 8+ routes still use app server time for DB-stored timestamps [MEDIUM/HIGH]

**Files:** See CR-1 through CR-8 in code-reviewer review.
**Description:** The DB-time migration (started in cycles 5-7) addressed the most critical clock-skew vectors (session revocation, contest deadlines, access code expiry). However, 8+ routes still use `new Date()` for DB-stored timestamps. This creates an architectural inconsistency: the same `enrolledAt` column stores timestamps from different clock sources depending on the code path (invite route uses DB time, manual enrollment uses app time). The migration should be completed systematically.
**Concrete failure scenario:** A developer assumes all DB-stored timestamps use DB time and writes a query that compares `enrolledAt` with `NOW()`. The mixed time sources make this comparison unreliable.
**Fix:** Complete the migration by replacing all `new Date()` calls in API routes and server actions that write to DB columns with `getDbNowUncached()`.
**Confidence:** HIGH

### ARCH-2: Stale plan status in cycle 7 and cycle 24 remediation documents [LOW/HIGH]

**Files:** `plans/open/2026-04-20-cycle-7-review-remediation.md`, `plans/open/2026-04-20-cycle-24-review-remediation.md`
**Description:** The cycle 7 plan shows M3 as TODO but the invite route already has the fix (commit 598f52c9). The cycle 24 plan shows M2 as TODO but `/workspace` is already removed from `public-route-seo.ts`. The cycle 25 plan shows M2 as TODO but the progress log says DONE. These stale statuses waste reviewer time and could lead to duplicate work.
**Fix:** Update plan statuses to match actual code state. Archive plans where all items are DONE.
**Confidence:** HIGH (verified by code inspection)

### ARCH-3: `PaginationControls` is a valid async server component — prior cycle 22 AGG-1 was a false positive [INFO/HIGH]

**File:** `src/components/pagination-controls.tsx`
**Description:** The cycle 22 aggregate review (AGG-1) claimed that `PaginationControls` was an invalid async client component marked with `"use client"`. Inspection shows it has NO `"use client"` directive and is a valid async server component using `getTranslations` from `next-intl/server`. The `/practice` and `/rankings` outages reported in cycle 22 were likely caused by a different issue (perhaps the stale `nav.workspace` key or a deployment artifact) that has since been resolved by the workspace-to-public migration.
**Fix:** Document this as resolved / false positive. No code change needed.
**Confidence:** HIGH

## Verified Safe

- Navigation is properly centralized via `src/lib/navigation/public-nav.ts` with shared dropdown item definitions.
- The workspace-to-public migration is complete: no `/workspace` references remain in source code, SEO config, or robots.txt.
- Korean letter-spacing remediation is comprehensive and consistent across all components.
