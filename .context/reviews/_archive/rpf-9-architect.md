# RPF Cycle 9 Architect Review

**Date:** 2026-04-20
**Base commit:** c30662f0

## Findings

### ARCH-1: `globals.css` global letter-spacing is architecture-level violation of i18n rule [HIGH/HIGH]

**Files:** `src/app/globals.css:129,213`
**Description:** The CSS architecture for letter-spacing has an inconsistency: Tailwind utility classes correctly use locale-conditional tracking via template literals, but `globals.css` applies letter-spacing unconditionally at the `html` and `.problem-description` heading level. This is an architecture gap — the i18n letter-spacing policy exists at the component level but is not enforced at the CSS layer.
**Fix:** Implement CSS-level locale-conditional letter-spacing using `:lang()` selectors or CSS custom properties set by the `<html lang>` attribute.

### ARCH-2: Incomplete `getDbNowUncached()` migration — server actions missed [MEDIUM/MEDIUM]

**Files:** `src/lib/actions/plugins.ts`, `src/lib/actions/language-configs.ts`, `src/lib/actions/system-settings.ts`, `src/lib/actions/user-management.ts`
**Description:** The DB-time migration that covered API routes (cycles 7-8) did not include server actions. Server actions write to the same tables (plugins, language_configs, system_settings, users) using `new Date()` while API routes use `getDbNowUncached()`. This is an architectural gap in the time-source migration.
**Fix:** Extend the `getDbNowUncached()` migration to cover all server actions that write timestamps.

## Verified Safe

- Navigation is centralized via shared `public-nav.ts`.
- The workspace-to-public migration is complete.
- `createApiHandler` pattern provides consistent auth/CSRF/rate-limit middleware.
