# Cycle 19 Designer (UI/UX) Findings

**Date:** 2026-04-19
**Reviewer:** UI/UX review — information architecture, accessibility, responsive design
**Base commit:** 301afe7f

---

## Findings

### F1: PublicHeader mobile menu focus trap has a potential accessibility gap — focus not restored on close

- **File**: `src/components/layout/public-header.tsx:131-175`
- **Severity**: LOW
- **Confidence**: MEDIUM
- **Description**: The mobile menu focus trap (lines 147-170) correctly handles Tab/Shift+Tab wraparound and Escape to close. However, when the menu closes via the `closeMobileMenu` function (line 177-181), focus is restored via `requestAnimationFrame(() => toggleRef.current?.focus())`. This is correct for explicit close actions (clicking a link, pressing Escape), but if the menu closes because of a route change (line 113-128), focus is NOT explicitly restored — it's left at whatever the browser's default focus behavior is after navigation. This can leave keyboard users disoriented.
- **Concrete failure scenario**: A keyboard user opens the mobile menu, navigates to a link with Tab, and presses Enter. The route changes, the menu closes (line 115-125), but focus is not restored to the toggle button. The user must Tab through the entire page to find their place.
- **Suggested fix**: In the route-change effect (line 113-128), after closing the menu, also restore focus to `toggleRef.current` using the same `requestAnimationFrame` pattern as `closeMobileMenu`.

### F2: AppSidebar sign-out button lacks visible keyboard focus indicator

- **File**: `src/components/layout/app-sidebar.tsx:302`
- **Severity**: LOW
- **Confidence**: LOW
- **Description**: The `SidebarMenuButton` for sign-out uses the default focus styling from the shadcn/ui sidebar component. While shadcn/ui components generally have good focus indicators, the sign-out button in the sidebar footer may have insufficient contrast for the focus ring against the sidebar background, depending on the theme.
- **Concrete failure scenario**: A keyboard user navigates to the sign-out button. The focus ring is visible but has low contrast against the sidebar footer background, making it hard to see which element is focused.
- **Suggested fix**: Verify that the focus ring on `SidebarMenuButton` in the footer has sufficient contrast (WCAG 2.2 SC 2.4.7: at least 3:1 contrast ratio for focus indicators). This may already be handled by the base component styles.

### F3: Breadcrumb is in main content area instead of top navbar — navigation pattern inconsistency

- **File**: `src/app/(dashboard)/layout.tsx:100`
- **Severity**: LOW
- **Confidence**: HIGH
- **Description**: The breadcrumb is rendered inside `<main>` below the sidebar inset. Per the workspace-to-public migration plan Phase 3, the breadcrumb should be moved to the top navbar area. The current placement means the breadcrumb is not visible when the main content area is scrolled down. This is a UX issue for deep navigation hierarchies (e.g., Groups > Group > Assignment > Student).
- **Concrete failure scenario**: A user scrolls down in a long student submission page. The breadcrumb is no longer visible. The user has to scroll back to the top to see where they are in the navigation hierarchy.
- **Suggested fix**: Move the breadcrumb into the `SidebarInset` header area or the `PublicHeader` component, so it remains visible while scrolling.

---

## Verified Safe

### VS1: Korean letter spacing is correctly handled
- Both `AppSidebar` (line 269) and `PublicHeader` (line 328) correctly skip `tracking-wider`/`tracking-wide` for Korean locale (`locale !== "ko"` check).

### VS2: Mobile menu has proper ARIA attributes
- The hamburger button has `aria-label`, `aria-controls`, and `aria-expanded`. The mobile panel has `role="region"` and `aria-label`.

### VS3: Skip-to-content link is properly implemented
- The `SkipToContent` component is rendered in the dashboard layout (line 89) with a target ID and label.

### VS4: Focus trap in mobile menu correctly handles wraparound
- The Tab/Shift+Tab handling (lines 147-170) correctly identifies the first and last focusable elements and wraps focus at the boundaries.
