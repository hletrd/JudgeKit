# Cycle 10 Designer (UI/UX) Report

**Reviewer:** designer
**Date:** 2026-04-19
**Base commit:** 56e78d62
**Scope:** UI/UX review for Next.js web app

## Inventory of Files Reviewed

- `src/app/(public)/layout.tsx` — Public layout with PublicHeader/PublicFooter
- `src/app/(dashboard)/layout.tsx` — Dashboard layout with AppSidebar
- `src/components/layout/public-header.tsx` — Top navigation component
- `src/components/layout/app-sidebar.tsx` — Dashboard sidebar
- `src/app/globals.css` — Global styles
- `messages/` — i18n message files

## Findings

### CR10-D1 — [MEDIUM] PublicHeader and AppSidebar use different role-checking mechanisms — navigation items will diverge for custom roles

- **Confidence:** HIGH
- **Cross-agent agreement:** critic CR10-CT2
- **File:** `src/components/layout/public-header.tsx:50-71`, `src/components/layout/app-sidebar.tsx:198-233`
- **Evidence:** `PublicHeader.getDropdownItems()` checks `role === "instructor" || role === "admin" || role === "super_admin"` (hardcoded). `AppSidebar.filterItems()` checks `capsSet.has(item.capability)` (dynamic). A custom role with `problems.create` capability but not `"instructor"` role would see "Problems" in the sidebar but not in the public header dropdown. This creates an inconsistent user experience where the available navigation depends on which part of the app you're in.
- **UX impact:** Users with custom roles will see different navigation items in different contexts, leading to confusion about what features they can access.
- **Suggested fix:** Refactor `getDropdownItems` to accept capabilities and use capability-based filtering, matching `AppSidebar`'s approach.

### CR10-D2 — [LOW] `tracking-tight` applied to site title in public header — may affect Korean text

- **Confidence:** LOW
- **File:** `src/components/layout/public-header.tsx:176`
- **Evidence:** Per CLAUDE.md rules, Korean text must not have custom `letter-spacing`. The site title link uses `tracking-tight` class (line 176). If the site title is in Korean (configurable via system settings), this would violate the Korean letter spacing rule.
- **Suggested fix:** Remove `tracking-tight` from the site title, or make it conditional on the current locale being non-Korean.

### CR10-D3 — [LOW] `tracking-wide` used in sidebar group label and mobile menu heading

- **Confidence:** LOW
- **File:** `src/components/layout/app-sidebar.tsx:291`, `src/components/layout/public-header.tsx:301`
- **Evidence:** `tracking-wider` and `tracking-wide` are used on sidebar group labels and mobile menu headings. These are typically English text ("ADMINISTRATION", "Dashboard"), but if the i18n translation is Korean, the tracking would apply to Korean glyphs.
- **Suggested fix:** Verify that all text with `tracking-*` classes uses English-only or make the class locale-conditional.

## Assessment

The most significant UX issue is the navigation divergence (CR10-D1), which is already tracked in the workspace-to-public migration plan and flagged by the critic. The Korean letter spacing issues (CR10-D2, CR10-D3) are minor but violate the project's CLAUDE.md rules.
