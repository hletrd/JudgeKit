# RPF Cycle 17 — Designer (UI/UX) Report

**Date:** 2026-04-20
**Reviewer:** designer
**Base commit:** HEAD (2af713d3)

---

## DES-1: Workers page `formatRelativeTime` is not localized — accessibility/i18n issue [MEDIUM/MEDIUM]

**Files:** `src/app/(dashboard)/dashboard/admin/workers/workers-client.tsx:85-95`
**Description:** The workers table shows "5m ago", "2h ago" etc. in hardcoded English. This is an i18n issue — the app supports Korean and English locales, and all other date/time formatting uses locale-aware utilities. For Korean users, relative time should display as "5분 전", "2시간 전" etc.

**Fix:** Replace with `formatRelativeTimeFromNow` from `@/lib/datetime`.
**Confidence:** MEDIUM

---

## DES-2: `access-code-manager.tsx` uses native `confirm()` dialog — inconsistent UX [LOW/MEDIUM]

**Files:** `src/components/contest/access-code-manager.tsx:88`
**Description:** The revoke action uses the browser's native `confirm()` dialog while all other destructive actions in the app use styled `AlertDialog` components. This creates an inconsistent UX — the native dialog looks different from the rest of the app, cannot be styled, and has poor accessibility (no ARIA attributes, no focus management).

**Fix:** Replace `confirm()` with an `AlertDialog` component matching the pattern used in `recruiting-invitations-panel.tsx`.
**Confidence:** MEDIUM

---

## DES-3: PublicHeader mobile menu lacks keyboard focus indicator on sign-out button [LOW/LOW]

**Files:** `src/components/layout/public-header.tsx:318-325`
**Description:** The mobile menu sign-out button uses `className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"` but lacks `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2` which is present on the navigation links (line 289). This means keyboard users get no visual focus indicator on the sign-out button in the mobile menu.

**Fix:** Add the focus-visible ring styles to the sign-out button.
**Confidence:** LOW

---

## Verified Safe

- Korean letter-spacing is properly handled — `tracking-tight`/`tracking-wide`/`tracking-wider` are all conditional on `locale !== "ko"`
- PublicHeader has proper focus management (focus trap, Escape to close, focus restoration)
- Mobile menu closes on route change
- ARIA labels are present on navigation elements
- Active navigation state is visually indicated
