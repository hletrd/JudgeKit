# Cycle 25 Critic Review

**Date:** 2026-04-20
**Base commit:** cbae7efd

## Findings

### CRI-1: Hardcoded "Solved" string is a localization defect [MEDIUM/HIGH]

**File:** `src/components/problem/public-problem-set-detail.tsx:81`
**Description:** The Badge text "Solved" is hardcoded in English while the rest of the component correctly uses i18n props for all other text. This is a clear localization defect that should have been caught during the component's initial review. It undermines the bilingual (en/ko) support the app otherwise provides.
**Fix:** Add a `solvedLabel` prop and pass the i18n string from the calling page.

### CRI-2: Korean letter-spacing remediation is incomplete — many components missed [MEDIUM/MEDIUM]

**Description:** Cycle 24's M3 task was marked as DONE, but the remediation only covered a subset of the components with hardcoded `tracking-tight`. Thirteen additional component locations across community, rankings, problem sets, discussions, user profile, and submissions pages still apply hardcoded `tracking-tight` to Korean-reachable headings. The cycle 24 review likely only checked the files it was told about, not the full codebase.
**Fix:** Systematically audit all `tracking-tight` usages in shared components and apply locale-conditional pattern.

### CRI-3: The "Languages" top-level nav item is an information architecture problem [MEDIUM/HIGH]

**File:** `src/lib/navigation/public-nav.ts:32`
**Description:** The "Languages" page is an informational reference page (lists supported programming languages and environment specs). It is not a primary action page like Practice, Contests, or Rankings. Having it at the top level alongside core workflows inflates the nav and dilutes its information hierarchy. The user-injected TODO correctly identifies this.
**Fix:** Move Languages to a secondary navigation location (footer link, "More" dropdown, or home page link).
