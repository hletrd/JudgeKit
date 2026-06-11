# Designer Review — RPF Cycle 19

**Date:** 2026-04-20
**Reviewer:** designer
**Base commit:** 77da885d

## Findings

### DES-1: PublicHeader mobile menu lacks ARIA role="menu" semantics — keyboard navigation uses custom focus trap instead [LOW/LOW]

**Files:** `src/components/layout/public-header.tsx:270-350`
**Description:** The mobile menu panel uses `role="region"` with a custom focus trap (lines 106-150). While the focus trap implementation is correct and handles Escape key + Tab/Shift+Tab wrapping, it does not use `role="menu"` / `role="menuitem"` ARIA patterns. Screen readers will announce it as a generic region rather than a navigation menu. This is a minor accessibility concern — the current implementation works for keyboard users but is not optimally announced to screen reader users.
**Fix:** Consider adding `role="navigation"` to the mobile menu `<nav>` element (already present on line 280) and ensuring the `aria-label` is descriptive. The current `role="region"` on the outer div can be changed to `role="dialog"` with `aria-modal="true"` for better screen reader semantics when the menu is open.

### DES-2: Mobile menu sign-out button keyboard focus indicator added but mobile touch target may be small [LOW/LOW]

**Files:** `src/components/layout/public-header.tsx:318-326`
**Description:** The sign-out button in the mobile menu has `focus-visible:outline-none focus-visible:ring-2` for keyboard accessibility (added in a recent commit). However, the touch target is `px-3 py-2 text-sm` which is approximately 36px tall — meeting the WCAG 2.2 minimum of 24px but below the recommended 44px for mobile touch targets.
**Fix:** Consider increasing padding to `py-3` for the mobile sign-out button to improve touch accessibility.
