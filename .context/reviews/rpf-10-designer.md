# Cycle 10 Designer Review

**Date:** 2026-04-20
**Reviewer:** designer
**Base commit:** fae77858

## Findings

### DES-1: Client-side date formatting ignores user locale in anti-cheat and API key components [LOW/MEDIUM]

**Files:** `src/components/contest/participant-anti-cheat-timeline.tsx:149`, `src/components/contest/anti-cheat-dashboard.tsx:256`, `src/components/contest/code-timeline-panel.tsx:75`, `src/app/(dashboard)/dashboard/admin/api-keys/api-keys-client.tsx:280`
**Description:** Several client components format dates without respecting the user's locale. The app supports Korean (ko) and English (en) via next-intl, but these components use `toLocaleString()` (no locale argument) or `toLocaleDateString(undefined, ...)` which falls back to the browser's default locale. For Korean users on non-Korean browsers, this produces English-formatted dates.
**Fix:** Use `useLocale()` from `next-intl` and pass the locale to `toLocaleString(locale, ...)` calls. Alternatively, use a shared formatting utility.
**Confidence:** Medium

### DES-2: Chat logs client uses `toLocaleString()` without locale [LOW/LOW]

**Files:** `src/app/(dashboard)/dashboard/admin/plugins/chat-logs/chat-logs-client.tsx:110,154`
**Description:** Admin chat log timestamps use `toLocaleString()` without locale. This is admin-only UI, so the impact is lower.
**Fix:** Use `useLocale()` for consistency.
**Confidence:** Low

## Verified Safe

- Korean letter-spacing is properly handled via CSS custom properties and `:lang(ko)` override.
- Responsive layout is well-structured with proper breakpoints.
- Accessibility attributes (ARIA roles, focus management) are present in interactive components.
- Dark/light mode is properly supported via next-themes.
