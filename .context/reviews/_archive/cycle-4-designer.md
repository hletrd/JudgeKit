# Cycle 4 Designer / UI/UX Review

**Reviewer:** designer
**Base commit:** 5086ec22

## Findings

### F1 — PublicHeader lacks authenticated dropdown menu (migration Phase 2)
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **File:** `src/components/layout/public-header.tsx:154-176`
- **Description:** When a user is logged in, the PublicHeader shows only a single link (e.g., "Dashboard"). The migration plan calls for a dropdown menu with role-appropriate links (Problems, Groups, Submissions, Profile, Admin). Without this, authenticated users must manually navigate to `/dashboard` and use the sidebar, creating a disjointed experience between public and authenticated pages.
- **UX impact:** Users cannot discover dashboard features from public pages. The "Dashboard" link is not discoverable as a navigation hub — it appears as a simple button, not a menu.
- **Suggested fix:** Implement the authenticated dropdown as described in the migration plan Phase 2.

### F2 — Mobile menu has no authenticated-user navigation items
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **File:** `src/components/layout/public-header.tsx:230-256`
- **Description:** In the mobile menu, when `loggedInUser` is present, only a single link to the dashboard is shown. There are no "My Submissions", "Profile", or "Admin" links. Mobile users have no way to access dashboard features from the mobile menu.
- **UX impact:** Mobile users must navigate to `/dashboard` first, then use the dashboard sidebar — adding an extra navigation step.
- **Suggested fix:** Add role-appropriate navigation items to the mobile menu when logged in, mirroring the desktop dropdown.

### F3 — No skip-to-content link in PublicHeader
- **Severity:** LOW
- **Confidence:** HIGH
- **File:** `src/components/layout/public-header.tsx`
- **Description:** The PublicHeader does not include a skip-to-content link for keyboard users. This is a WCAG 2.2 accessibility requirement (2.4.1 Bypass Blocks). Users who navigate by keyboard must tab through all navigation links on every page load.
- **Suggested fix:** Add a visually-hidden skip link as the first focusable element in the header.

### F4 — Mobile menu outside-click dismiss is missing
- **Severity:** LOW
- **Confidence:** MEDIUM
- **File:** `src/components/layout/public-header.tsx:200-259`
- **Description:** The mobile menu can only be dismissed by clicking the X button or pressing Escape. Clicking outside the menu panel does not close it. This is a common UX expectation for overlay menus.
- **Suggested fix:** Add an outside-click handler using a backdrop div or `useClickOutside` hook.
