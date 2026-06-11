# Cycle 51 — Designer (UI/UX)

**Date:** 2026-04-23
**Base commit:** 778a019f
**Reviewer:** designer

## UI/UX Assessment

This is a Next.js web application with both public-facing and dashboard UIs. Review focused on accessibility, UX patterns, and interaction design.

## Inventory of Reviewed Files

- `src/components/exam/anti-cheat-monitor.tsx` (full)
- `src/app/(public)/practice/page.tsx` (full)
- `src/components/contest/leaderboard-table.tsx` (reference)
- `src/components/layout/app-sidebar.tsx` (reference)
- `src/proxy.ts` (reference — CSP, HSTS)
- `src/components/seo/json-ld.tsx` (reference)

## Findings

### DES-1: Anti-cheat privacy notice dialog lacks focus trap and ARIA role [LOW/LOW] (carry-over from cycle 48)

**File:** `src/components/exam/anti-cheat-monitor.tsx:259-284`

**Description:** The privacy notice Dialog uses `disablePointerDismissal` and `showCloseButton={false}` to force the user to accept, which is good. However, the dialog does not announce itself to screen readers with `role="alertdialog"` since it requires user action before proceeding. The Dialog component from the UI library likely handles focus trapping, but the specific configuration should be verified for this blocking dialog pattern.

**Status:** Deferred — the Dialog component from the UI library likely handles ARIA roles and focus trapping, but this should be verified for the blocking (non-dismissible) configuration.

### DES-2: Contests page badge hardcoded colors (LOW/LOW) (carry-over from cycle 46)

**Status:** Deferred — cosmetic, low impact.

### DES-3: Chat widget button badge lacks ARIA announcement (LOW/LOW) (carry-over from cycle 45)

**Status:** Deferred — low impact.

## UX Positive Observations

1. The practice page has proper `<label>` elements with `htmlFor` attributes for form fields.
2. The pagination controls include `aria-current="page"` for the active page link.
3. The progress filter tabs use `aria-current="page"` for the active filter.
4. CSP headers include proper nonce-based script-src for XSS protection.
5. HSTS is properly configured with `includeSubDomains`.
6. The anti-cheat privacy notice forces user acknowledgment before tracking begins — good consent pattern.
7. Korean letter-spacing is not customized (per CLAUDE.md rules) — verified no `tracking-*` or `letter-spacing` on Korean content.
