# Document Specialist — Cycle 24

**Date:** 2026-04-20
**Base commit:** f1b478bc

## Findings

### DOC-1: `apiFetch` convention documentation is not enforced by code [MEDIUM/MEDIUM]

**Files:** `src/lib/api/client.ts:1-5`
**Description:** The `apiFetch` module documents a convention: "Never silently swallow errors — always surface them to the user." However, this convention is only documented as a comment, not enforced by code (e.g., a lint rule, a wrapper function that auto-reports errors, or a TypeScript type that requires error handling). Multiple components violate this convention (see CRI-1). Documentation without enforcement is easily overlooked.
**Fix:** Either create a `useApiFetch` hook that enforces error handling, or add an ESLint rule that flags `catch { // ignore }` patterns.
**Confidence:** MEDIUM

### DOC-2: `ContestsLayout` lacks Next.js bug tracker reference [LOW/HIGH]

**Files:** `src/app/(dashboard)/dashboard/contests/layout.tsx:7-10`
**Description:** The layout's JSDoc mentions "Next.js 16 RSC streaming bug" but does not link to a specific GitHub issue. Without a reference, it's impossible to determine:
1. Which specific bug this works around
2. Which Next.js version(s) are affected
3. When the workaround can be safely removed
**Fix:** Add a GitHub issue link or Next.js version reference to the JSDoc.
**Confidence:** HIGH

### DOC-3: `AppSidebar` dead `titleKeyByMode` lacks removal explanation [LOW/MEDIUM]

**Files:** `src/components/layout/app-sidebar.tsx:66-67`
**Description:** The `titleKeyByMode: { recruiting: "challenges" }` property on the Problems nav item is dead code (hidden by `hiddenInModes: ["recruiting"]`). There is no comment explaining why this seemingly contradictory configuration exists. A developer might assume it's intentional and avoid cleaning it up.
**Fix:** Remove the dead property, or add a comment explaining that it's retained for potential future use.
**Confidence:** MEDIUM

## Verified Documentation

- `src/lib/navigation/public-nav.ts` has clear JSDoc for all functions.
- `src/lib/api/client.ts` documents the error-handling convention.
- Migration plan at `plans/open/2026-04-19-workspace-to-public-migration.md` is up-to-date through Phase 4.
