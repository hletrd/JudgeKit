# Cycle 12 — Designer (UI/UX)

**Date:** 2026-04-19
**Base commit:** 2339c7ea

## Findings

### CR12-D1 — [MEDIUM] Dashboard layout has double-header pattern — PublicHeader + SidebarInset header

- **File:** `src/app/(dashboard)/layout.tsx:72-93, 104-110`
- **Confidence:** HIGH
- **Evidence:** The dashboard layout renders:
  1. `PublicHeader` — full-width top nav with site links, user dropdown, theme/locale toggles
  2. `SidebarInset` header — contains sidebar hamburger trigger and lecture mode toggle

  This creates two horizontal bars at the top of the page, consuming ~96px of vertical space (56px PublicHeader + ~40px sidebar header). The sidebar trigger (hamburger icon) is separated from the rest of the sidebar controls, which is confusing for users who expect it in the top navbar area.

  **Layout structure:**
  ```
  [PublicHeader: Logo | Nav Links | User Dropdown | Theme | Locale]
  [Sidebar Header: Hamburger | (spacer) | Lecture Toggle]
  [Sidebar | Main Content with Breadcrumb]
  ```

  **Expected layout (after Phase 3 completion):**
  ```
  [PublicHeader: Hamburger | Logo | Nav Links | User Dropdown | Lecture Toggle | Theme | Locale]
  [Sidebar | Main Content with Breadcrumb]
  ```
- **Suggested fix:** Move the sidebar trigger and lecture mode toggle into PublicHeader. Remove the SidebarInset header.

### CR12-D2 — [LOW] Mobile menu lacks "back to public site" link for dashboard users

- **File:** `src/components/layout/public-header.tsx:317-343`
- **Confidence:** MEDIUM
- **Evidence:** The mobile menu in PublicHeader shows dashboard navigation items (Dashboard, Problems, Groups, etc.) when logged in, but there's no "back to public site" link. Users who navigate to the dashboard from a public page may want to return to public pages but the mobile menu only shows dashboard items.
- **Suggested fix:** Add a "Public Site" or "Home" link at the top of the authenticated mobile menu section.

### CR12-D3 — [LOW] `tracking-wide` still present on mobile menu "DASHBOARD" label

- **File:** `src/components/layout/public-header.tsx:320`
- **Confidence:** LOW
- **Evidence:** Line 320 has `tracking-wide` on the "DASHBOARD" label. This was identified in cycle 11 (D15) and deferred because the label is currently English uppercase text. If i18n translates it to Korean, the tracking would violate the CLAUDE.md rule. The comment on line 319 acknowledges this.
- **Suggested fix:** Make the tracking class locale-conditional when Korean i18n is implemented for this label.

### CR12-D4 — [LOW] PublicHeader dropdown menu items use raw English keys as labels

- **File:** `src/components/layout/public-header.tsx:71-87`
- **Confidence:** MEDIUM
- **Evidence:** The `getDropdownItems` function returns items with `label` values like "dashboard", "problems", "groups", "mySubmissions", "profile", "admin". These are used as i18n keys via `tShell(\`nav.${item.label}\`)` on line 235. If a key is missing from the translation file, the raw English string would be displayed. This is a fragile pattern — a typo in the label would not be caught at compile time.
- **Suggested fix:** Consider using a union type for valid label keys to get compile-time safety.
