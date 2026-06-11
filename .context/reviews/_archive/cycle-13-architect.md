# Cycle 13 Architect Report

**Date:** 2026-04-19
**Base commit:** e8340da5
**Reviewer angle:** Architectural/design risks, coupling, layering

---

## CR13-AR1 — [MEDIUM] Navigation item definition is duplicated across three layouts

- **File:** `src/app/(public)/layout.tsx:29-35`, `src/app/(dashboard)/layout.tsx:74-81`, `src/app/(control)/layout.tsx:49-57`
- **Confidence:** HIGH
- **Evidence:** The same set of public navigation items (practice, playground, contests, rankings, community, languages) is defined independently in the public layout and dashboard layout. The control layout has its own subset. This violates DRY and creates coupling risk — any navigation change requires updating 2-3 files. The dashboard layout even uses a different i18n namespace (`common` vs `publicShell`) for the same items.
- **Scenario:** A new public route "docs" is added. It must be added to public/layout.tsx, dashboard/layout.tsx, and possibly control/layout.tsx. Missing one creates an inconsistent experience.
- **Suggested fix:** Extract a shared `getPublicNavItems(t: TranslationFn)` utility or a navigation config file that all layouts consume. Different i18n namespaces should be unified or the helper should accept the right namespace.

## CR13-AR2 — [MEDIUM] `(control)` route group should merge into `(dashboard)` — it duplicates layout concerns

- **File:** `src/app/(control)/layout.tsx`, `src/app/(control)/control/`
- **Confidence:** HIGH
- **Evidence:** The control panel has its own layout with auth gating, sidebar navigation, and header. It shares many links with `AppSidebar` (groups, admin/users, admin/languages, admin/settings). The only unique page is `/control/discussions` which requires `community.moderate` capability. This is already tracked in the migration plan (Phase 3, item 3: "Evaluate whether `(control)` route group should merge into `(dashboard)/admin` or remain separate").
- **Suggested fix:** Move `/control/discussions` to `/dashboard/admin/community-moderation` (or similar). Add the `community.moderate` capability check to `AppSidebar`. Remove the entire `(control)` route group and layout.

## CR13-AR3 — [LOW] `AuthUserRecord` type and `mapUserToAuthFields` are tightly coupled but defined in separate files

- **File:** `src/lib/auth/types.ts:26-44`, `src/lib/auth/config.ts:78-101`
- **Confidence:** LOW
- **Evidence:** `AuthUserRecord` defines the shape of the auth user data. `mapUserToAuthFields` maps `AuthUserInput` to the same fields with defaults. The fields in both must stay synchronized. Adding a field to `AuthUserRecord` without adding it to `mapUserToAuthFields` would silently drop the field. The `AUTH_PREFERENCE_FIELDS` constant helps with the preference fields, but the core fields (id, username, email, etc.) are listed separately in `AUTH_CORE_FIELDS`, `AuthUserRecord`, and `mapUserToAuthFields`.
- **Suggested fix:** Consider deriving the output type of `mapUserToAuthFields` from `AuthUserRecord` using TypeScript's utility types, or at minimum add a compile-time assertion that the return type matches `AuthUserRecord`.

---

## Final Sweep

- The auth module architecture is clean after the cycle 12 refactoring. `mapUserToAuthFields` is the single source of truth for field mapping, used by `createSuccessfulLoginResponse`, `syncTokenWithUser`, and `authorizeRecruitingToken`.
- The `capabilities/cache.ts` module provides a clean caching layer for role resolution with proper invalidation.
- The `createApiHandler` factory pattern provides consistent auth/CSRF/rate-limit/body-validation across API routes.
- The SSE route's shared polling architecture is sound — one timer for all subscribers, with per-connection callbacks.
