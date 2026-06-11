# Cycle 20 Designer Findings

**Date:** 2026-04-19
**Reviewer:** UI/UX review — web frontend accessibility, navigation, responsive design
**Base commit:** 95f06e5b

---

## Findings

### F1: Breadcrumb sticky header may overlap with mobile hamburger menu

- **File**: `src/app/(dashboard)/layout.tsx:99-101`, `src/components/layout/public-header.tsx:275-294`
- **Severity**: LOW
- **Confidence**: MEDIUM
- **Description**: The breadcrumb is in a sticky header (`top-0 z-10`) inside `SidebarInset`. The `PublicHeader` also uses `border-b bg-background/95` but is outside `SidebarInset`. On mobile, when the hamburger menu is open, the breadcrumb header and the mobile menu panel may compete for vertical space. The breadcrumb is within the `SidebarInset` scrollable area, while the mobile menu is an overlay from `PublicHeader`. When the sidebar is collapsed on mobile, the breadcrumb header takes up ~44px at the top of the content area. Combined with the PublicHeader (~56px), that's ~100px of chrome before content starts on mobile viewports.
- **Concrete failure scenario**: On a mobile device (375px viewport), the user sees the PublicHeader (~56px) + breadcrumb header (~44px) + main content padding (24px) = ~124px before any actual content. This is 33% of the viewport height on a small phone.
- **Suggested fix**: Consider hiding the breadcrumb header on mobile (`hidden md:block`) since the mobile navigation pattern doesn't use breadcrumbs effectively. Mobile users navigate via the hamburger menu and back button, not breadcrumbs.

### F2: PublicHeader desktop nav uses `hidden md:flex` — may have too many items at md breakpoint

- **File**: `src/components/layout/public-header.tsx:207`
- **Severity**: LOW
- **Confidence**: LOW
- **Description**: The desktop navigation shows all `items` starting at the `md` breakpoint (768px). With 7+ nav items (Practice, Playground, Contests, Rankings, Community, Languages) plus the user dropdown, the nav bar may overflow at the `md` breakpoint on smaller desktop screens. The `min-w-0 flex-1` on the nav element allows it to shrink, but the items have fixed `px-3 py-2` padding that doesn't scale down.
- **Concrete failure scenario**: On a 768px viewport with Korean labels (which are typically shorter), this is fine. On an 800px viewport with English labels, the items may overflow and push the user dropdown off-screen.
- **Suggested fix**: Consider using `lg:flex` instead of `md:flex` for the desktop nav, or add responsive text sizing. This is a minor UX concern that depends on actual label lengths.

---

## Verified Safe

### VS1: Mobile menu focus trap correctly implemented
- **File**: `src/components/layout/public-header.tsx:149-172`
- The focus trap handles both Tab and Shift+Tab wraparound. The active element detection uses `findIndex` with `contains()` to handle nested focusable elements.

### VS2: Korean letter-spacing correctly handled
- **File**: `src/components/layout/public-header.tsx:330`
- The `tracking-wide` class is conditionally applied only when `locale !== "ko"`, complying with CLAUDE.md rules.

### VS3: Breadcrumb has proper ARIA and Schema.org markup
- **File**: `src/components/layout/breadcrumb.tsx:82-135`
- The breadcrumb uses `aria-label="Breadcrumb"`, `aria-current="page"` on the last item, and Schema.org `BreadcrumbList` markup for SEO.
