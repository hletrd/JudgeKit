# RPF Cycle 18 Review Remediation Plan

**Date:** 2026-04-20
**Source:** `rpf-cycle-18-aggregate.md`
**Status:** In Progress

## Priority Items (implement this cycle)

### H1: Add `formatNumber` locale-aware utility and replace hardcoded `toLocaleString("en-US")` [AGG-1]

**Severity:** MEDIUM/MEDIUM (4-agent signal)
**Files:** `src/lib/datetime.ts`, `src/components/submission-status-badge.tsx`
**Plan:**
1. Add `formatNumber(value: number, locale?: string | string[]): string` to `src/lib/datetime.ts`
2. Replace `n.toLocaleString("en-US")` in `submission-status-badge.tsx:45` with `formatNumber(n, locale)`
3. Pass `locale` prop through `SubmissionStatusBadge` -> `TooltipBody` -> `formatNumber`
4. Add unit test for `formatNumber` with "en-US" and "ko-KR" locales

### H2: Fix access code share link to include locale prefix [AGG-2]

**Severity:** LOW/MEDIUM (3-agent signal)
**Files:** `src/components/contest/access-code-manager.tsx:126`
**Plan:**
1. Import `useLocale` from `next-intl` and `buildLocalizedHref` from `@/lib/locale-paths`
2. Replace `const url = `${window.location.origin}/dashboard/contests/join?code=${code}`;` with locale-aware URL construction
3. This is a one-line fix

### M1: Replace hardcoded English string in api-keys clipboard fallback [AGG-4]

**Severity:** LOW/MEDIUM
**Files:** `src/app/(dashboard)/dashboard/admin/api-keys/api-keys-client.tsx:201`, `messages/en.json`, `messages/ko.json`
**Plan:**
1. Add `copyFailed` key to `admin.apiKeys` namespace in both `en.json` and `ko.json`
2. Replace hardcoded `"Failed to copy — please select and copy manually"` with `t("copyFailed")`

### M2: Replace `userId!` non-null assertion with explicit capture [AGG-5]

**Severity:** LOW/MEDIUM
**Files:** `src/app/(public)/practice/page.tsx:431`
**Plan:**
1. Add `const uid = userId!; /* guaranteed by currentProgressFilter check */` at the start of the else block (line ~411)
2. Replace `userId!` on line 431 with `uid`

### M3: Add clipboard error feedback to copy-code-button [AGG-6]

**Severity:** LOW/LOW
**Files:** `src/components/code/copy-code-button.tsx:20-31`
**Plan:**
1. Add a `catch` block after `document.execCommand("copy")` that shows a toast error
2. Add `copyFailed` i18n key to `common` namespace if not already present (it may already exist from previous cycles)
3. If `execCommand` returns false, show the toast error

## Deferred Items

### DEFER-1: Practice page progress-filter SQL CTE optimization [AGG-3]

**Original severity:** MEDIUM/MEDIUM
**Reason for deferral:** Significant refactoring scope — requires rewriting the progress filter query logic and careful testing. The current code works correctly for existing problem counts. The code already has a comment acknowledging this tech debt.
**Exit criterion:** Problem count exceeds 5,000 or a performance benchmark shows >2s page load time with progress filters.

### DEFER-2: Practice page decomposition — extract data module [AGG-7]

**Original severity:** LOW/MEDIUM
**Reason for deferral:** Large refactoring scope that should be combined with DEFER-1. Extracting the data module without also fixing the progress filter query would create a module with the same performance issue.
**Exit criterion:** DEFER-1 is picked up, or the page exceeds 800 lines.

### DEFER-3: Recruiting invitations panel `min` date uses client time [AGG-8]

**Original severity:** LOW/LOW
**Reason for deferral:** Server-side validation already prevents invalid dates. The `min` attribute is a UX hint only. Adding a server-provided date would require passing additional props through the component hierarchy for minimal benefit.
**Exit criterion:** Users report date picker UX issues, or a pattern for passing server time to client components is established.

## Workspace-to-Public Migration Progress

**Current phase:** Phase 4 — IN PROGRESS
**Next step:** Remove redundant page components under `(dashboard)` where public counterparts exist.

Per the user-injected TODO, this cycle should make incremental progress on the workspace-to-public migration. The migration plan is at `plans/open/2026-04-19-workspace-to-public-migration.md`. The remaining Phase 4 item is:

> Remove redundant page components under `(dashboard)` where public counterparts exist.

Dashboard pages that now have public counterparts and redirect:
- `/dashboard/rankings` -> `/rankings` (already redirects)
- `/dashboard/languages` -> `/languages` (already redirects)
- `/dashboard/compiler` -> `/playground` (already redirects)

These pages redirect but the page components still exist. Removing them would clean up the codebase. This will be addressed as an additional implementation item this cycle.

### M4: Remove redundant dashboard page components that redirect to public counterparts

**Files to remove:**
- `src/app/(dashboard)/dashboard/rankings/` (if it exists as a separate directory)
- `src/app/(dashboard)/dashboard/languages/` (if it exists as a separate directory)
- `src/app/(dashboard)/dashboard/compiler/` (if it exists as a separate directory)

**Plan:**
1. Verify that redirect pages exist and work correctly
2. Verify that sidebar links point to public URLs
3. Remove the page component directories (keep the redirect files if they are at the route level)
4. Run gates to verify no breakage
