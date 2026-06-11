# Cycle 11 Designer (UI/UX) Report

**Reviewer:** designer
**Date:** 2026-04-19
**Base commit:** 6c99b15c
**Scope:** UI/UX review for Next.js web app

## Inventory of Files Reviewed

- `src/app/(public)/layout.tsx` — Public layout with PublicHeader/PublicFooter
- `src/app/(dashboard)/layout.tsx` — Dashboard layout with AppSidebar
- `src/components/layout/public-header.tsx` — Top navigation component
- `src/components/layout/app-sidebar.tsx` — Dashboard sidebar
- `src/app/globals.css` — Global styles

## Findings

### CR11-D1 — [LOW] `tracking-wide` used in sidebar group label and mobile menu heading — may affect Korean text

- **Confidence:** LOW
- **File:** `src/components/layout/app-sidebar.tsx:291`, `src/components/layout/public-header.tsx:320`
- **Evidence:** The cycle 10 fix (commit 79204982) removed `tracking-tight` from the site title and added a comment on the `tracking-wide` usage in the mobile menu heading. The comment says "tracking-wide is for English uppercase text only (e.g. 'DASHBOARD') — do not apply to Korean labels". However, if the i18n translation for the dashboard label is in Korean (e.g., "대시보드"), the `tracking-wide` would apply to Korean glyphs, violating CLAUDE.md rules. The sidebar group label (`src/components/layout/app-sidebar.tsx:291`) also uses `tracking-wider` on text that could be Korean.
- **Suggested fix:** Make the `tracking-wide`/`tracking-wider` class conditional on the current locale being non-Korean. Or verify that the labels are always in English (uppercase text like "DASHBOARD", "ADMINISTRATION").

### CR11-D2 — [LOW] PublicHeader mobile menu lacks visible focus indicator on touch devices

- **Confidence:** LOW
- **File:** `src/components/layout/public-header.tsx:269-283`
- **Evidence:** The mobile hamburger button (line 269-283) has `focus-visible:ring-2` styling, which is keyboard-only. On touch devices, there is no visual feedback that the button was pressed. This is a minor UX issue — the button does change icon (Menu to X), which provides some feedback.
- **Suggested fix:** Add an `active:bg-accent` class for touch-device press feedback.

## Assessment

The most significant UI/UX issue from cycle 10 (navigation divergence between PublicHeader and AppSidebar) has been fixed with capability-based filtering. The remaining Korean letter spacing issues are minor but violate CLAUDE.md rules. The workspace-to-public migration Phase 3 is the key UX improvement opportunity.
