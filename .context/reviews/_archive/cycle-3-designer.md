# Cycle 3 Designer (UI/UX) Review

**Date:** 2026-04-19
**Base commit:** f637c590
**Reviewer:** designer

## Findings

### F1 — PublicHeader `loggedInUser` shows only a single link, no dropdown menu
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **File:** `src/components/layout/public-header.tsx:154-160`
- **Evidence:** When logged in, the header shows a single "Dashboard" link (or similar). There is no dropdown menu for profile, submissions, or sign-out. Users must navigate to the dashboard to access these actions.
- **Why it matters:** The workspace-to-public migration plan (Phase 2) calls for a "Dashboard" dropdown with role-appropriate links. The current implementation is the baseline that needs enhancement.
- **WCAG impact:** A dropdown menu requires proper ARIA attributes (`aria-haspopup`, `aria-expanded`) and keyboard navigation (arrow keys, Escape to close). The current single link is accessible but limited.
- **Suggested fix:** Implement the authenticated dropdown as specified in the migration plan Phase 2.

### F2 — WorkspaceNav `tracking-[0.18em]` applies to English uppercase section label
- **Severity:** CLOSED (already confirmed safe in cycle 2)
- **File:** `src/components/layout/workspace-nav.tsx:31`
- **Evidence:** The `tracking-[0.18em]` applies to `sectionLabel` which is English uppercase text. This is safe per CLAUDE.md rules (Korean text should not have custom letter-spacing).

### F3 — Mobile navigation in PublicHeader lacks skip-to-content link
- **Severity:** LOW
- **Confidence:** MEDIUM
- **File:** `src/components/layout/public-header.tsx`
- **Evidence:** The header has no skip-to-content link. When the mobile menu is open, keyboard users must tab through all navigation items before reaching the main content.
- **WCAG impact:** WCAG 2.2 SC 2.4.1 (Bypass Blocks) — not strictly required but strongly recommended for pages with navigation blocks.
- **Suggested fix:** Add a visually-hidden skip-to-content link as the first focusable element in the header.

### F4 — PublicHeader mobile menu does not close on outside click
- **Severity:** LOW
- **Confidence:** MEDIUM
- **File:** `src/components/layout/public-header.tsx:200-259`
- **Evidence:** The mobile menu closes on route change (line 45-60) and Escape key (line 73-75), but not on outside click. If a user clicks outside the menu panel on mobile, the menu stays open.
- **Why it matters:** This is a common mobile UX pattern that users expect. The missing behavior could confuse users who try to dismiss the menu by tapping outside.
- **Suggested fix:** Add a click handler on the overlay/background that closes the menu.

## Summary

Found 3 actionable issues: 1 MEDIUM (no authenticated dropdown — needed for migration), 2 LOW (skip-to-content link, outside-click menu dismiss). The workspace nav tracking issue is confirmed safe from cycle 2.
