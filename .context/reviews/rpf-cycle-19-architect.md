# Architect Review — RPF Cycle 19

**Date:** 2026-04-20
**Reviewer:** architect
**Base commit:** 77da885d

## Findings

### ARCH-1: Scattered number/byte formatting utilities — no single source of truth [MEDIUM/MEDIUM]

**Files:** `src/lib/datetime.ts:62-67`, `src/lib/formatting.ts:1-8`, `src/app/(dashboard)/dashboard/_components/dashboard-judge-system-section.tsx:5-7`, `src/app/(dashboard)/dashboard/admin/files/page.tsx:50-54`, `src/app/(dashboard)/dashboard/admin/settings/database-info.tsx:13-18`
**Description:** Number and byte formatting is spread across 5+ files with no single source of truth:
- `formatNumber` in `datetime.ts` — shared utility for locale-aware number formatting
- `formatScore` in `formatting.ts` — rounds to 2 decimal places, no locale awareness
- Local `formatNumber` in `dashboard-judge-system-section.tsx` — duplicate of shared utility
- `formatFileSize` in `admin/files/page.tsx` — locale-unaware byte formatting
- `formatBytes` in `admin/settings/database-info.tsx` — locale-unaware byte formatting, slightly different range

This violates DRY and creates inconsistency risk as locale support expands.
**Fix:** Consolidate into `@/lib/formatting.ts`:
1. Move `formatNumber` from `datetime.ts` to `formatting.ts` (datetime.ts should re-export for backward compat)
2. Add `formatBytes(value, locale?)` using `formatNumber` for locale-aware digit grouping
3. Remove all local copies

### ARCH-2: Workspace-to-public migration Phase 4 still has open items — dashboard duplicate pages remain [LOW/MEDIUM]

**Files:** `plans/open/2026-04-19-workspace-to-public-migration.md`
**Description:** The migration plan Phase 4 lists "Remove redundant page components under `(dashboard)` where public counterparts exist" as remaining work. The dashboard rankings, languages, and compiler pages were redirected but the page components and route directories still exist. This creates maintenance burden — changes to public pages need to be duplicated in dashboard pages.
**Fix:** Remove the dashboard page components for rankings, languages, and compiler (they already redirect). This is a cleanup task, not an architectural risk.

### ARCH-3: `forceNavigate` in `navigation/client.ts` bypasses Next.js router — architectural smell [LOW/LOW]

**Files:** `src/lib/navigation/client.ts:3-5`
**Description:** `forceNavigate` uses `window.location.assign(url)` which causes a full page reload, bypassing the Next.js client-side router. This should only be used when Next.js routing is insufficient (e.g., cross-origin navigation or hard refresh). Its usage should be audited to ensure it's not being used where `router.push()` would suffice.
**Fix:** Audit all call sites. Add a JSDoc comment documenting when `forceNavigate` is appropriate vs. `router.push()`.
