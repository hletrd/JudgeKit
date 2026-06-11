# RPF Cycle 16 — Designer

**Date:** 2026-04-20
**Base commit:** 58da97b7

## Findings

### DES-1: Public problem detail page — "Rankings" button uses hardcoded English label [LOW/MEDIUM]

- **File:** `src/app/(public)/practice/problems/[id]/page.tsx:400`
- **Description:** The "Rankings" button in the problem statistics card uses a hardcoded English string `<Button variant="outline" size="sm">Rankings</Button>` instead of an i18n key. All other labels on the page use translation functions (e.g., `t("practice.stats.title")`). This will display "Rankings" even in Korean locale.
- **Fix:** Replace `Rankings` with an i18n key like `t("practice.viewRankings")` or `tCommon("rankings")`.
- **Confidence:** HIGH

### DES-2: Public problem detail page has no loading skeleton for the submit panel [LOW/LOW]

- **File:** `src/app/(public)/practice/problems/[id]/page.tsx:449`
- **Description:** The sticky submit panel (`Card id="public-submit-panel"`) is a complex component with a code editor. When the page first loads, there is no loading skeleton — the panel appears abruptly after the server component resolves. Other sections like the problem list have loading skeletons (`loading.tsx`).
- **Fix:** Consider adding a Suspense boundary with a skeleton for the submit panel.
- **Confidence:** LOW

### DES-3: Mobile menu — dropdown items in mobile panel lack icons [LOW/LOW]

- **File:** `src/components/layout/public-header.tsx:305-314`
- **Description:** The mobile menu renders dropdown items without the `DROPDOWN_ICONS` that are shown in the desktop dropdown. The desktop dropdown shows icons (LayoutDashboard, FileText, etc.) alongside labels, but the mobile panel only shows labels. This creates an inconsistent experience between desktop and mobile.
- **Fix:** Add `{DROPDOWN_ICONS[item.href]}` to the mobile panel's dropdown items, matching the desktop rendering.
- **Confidence:** MEDIUM

## Verified Safe

- Korean letter-spacing correctly conditioned on locale throughout all public components.
- Responsive layout for problem detail page: the `grid grid-cols-1 lg:grid-cols-2` pattern correctly stacks on mobile and shows side-by-side on desktop.
- Accessibility: mobile menu has proper focus trap, Escape key handling, and aria attributes.
- The "Edit" button on the public problem detail page is correctly styled with `variant="outline"` and conditionally rendered.
