# Cycle 13 Designer Report

**Date:** 2026-04-19
**Base commit:** e8340da5
**Reviewer angle:** UI/UX review — navigation, accessibility, responsive design, i18n

---

## CR13-D1 — [MEDIUM] Dashboard has duplicate navigation — sidebar + PublicHeader dropdown show same links

- **File:** `src/app/(dashboard)/layout.tsx:72-95` (PublicHeader) and `src/app/(dashboard)/layout.tsx:97-104` (AppSidebar)
- **Confidence:** HIGH
- **Evidence:** After Phase 3 progress, the dashboard layout now shows both the PublicHeader dropdown (with Dashboard, Problems, Groups, Submissions, Profile, Admin links) AND the full AppSidebar (with the same links plus more). This creates a confusing experience where users see the same navigation in two places with different visual presentations. The sidebar trigger is now in the PublicHeader leading slot, which is good, but the sidebar itself still shows the full set of links that overlap with the dropdown.
- **Suggested fix:** Slim down AppSidebar to only show items NOT in the PublicHeader dropdown, or convert it to an icon-only rail. This is tracked in the migration plan Phase 3.

## CR13-D2 — [LOW] Mobile menu lacks "back to public site" link for dashboard users (carried from AGG-9/D23)

- **File:** `src/components/layout/public-header.tsx:324-352`
- **Confidence:** MEDIUM
- **Evidence:** When logged in on mobile, the authenticated section shows dashboard items but no explicit "Public Site" or "Home" link. Public nav items are visible above the separator, but they're less prominent. Users might not realize they can scroll up to find public navigation.
- **Suggested fix:** Add a "Home" or "Back to Site" link at the top of the authenticated mobile section.

## CR13-D3 — [LOW] `tracking-wide`/`tracking-wider` on labels may affect Korean text (carried from AGG-12/D16)

- **File:** `src/components/layout/public-header.tsx:327`, `src/components/layout/app-sidebar.tsx:292`
- **Confidence:** LOW
- **Evidence:** Comments are present noting these are for English uppercase text only. If i18n translations change these labels to Korean, the tracking classes would need to be locale-conditional per CLAUDE.md rules.

## CR13-D4 — [LOW] Focus trap in mobile menu does not account for Shadow DOM or portals

- **File:** `src/components/layout/public-header.tsx:145-168`
- **Confidence:** LOW
- **Evidence:** The focus trap uses `panelRef.current.querySelectorAll` to find focusable elements. If a child component renders into a portal (e.g., a dropdown menu), those elements would not be found by the query selector. Currently, the mobile menu doesn't contain any portal-based components, so this is not a practical issue.

---

## Final Sweep

- The PublicHeader component has good accessibility: ARIA labels, focus management, keyboard navigation, screen reader announcements for menu state.
- The mobile menu focus trap (Shift+Tab wraparound) is correctly implemented.
- The `skipToContent` link is present in both layouts.
- Color contrast appears adequate (uses Tailwind semantic colors: `text-muted-foreground`, `bg-accent`, etc.).
- Responsive breakpoints are well-handled with `md:` breakpoint for desktop nav vs mobile hamburger.
