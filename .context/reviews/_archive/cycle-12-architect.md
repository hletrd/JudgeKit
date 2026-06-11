# Cycle 12 — Architect

**Date:** 2026-04-19
**Base commit:** 2339c7ea

## Findings

### CR12-AR1 — [MEDIUM] `mapUserToAuthFields` / `AuthUserInput` / `AuthUserRecord` type triangle has semantic drift

- **File:** `src/lib/auth/types.ts:26-72`, `src/lib/auth/config.ts:78-101`
- **Confidence:** HIGH
- **Evidence:** There are now three types for "user data passed to auth functions":
  1. `AuthUserRecord` — the "output" type with required core fields and optional preference fields
  2. `AuthUserInput` — the "input" type with all fields optional + index signature `[key: string]: unknown`
  3. The DB user type returned by Drizzle queries — has extra fields (passwordHash, isActive, tokenInvalidatedAt) not in either type

  The `mapUserToAuthFields` function accepts `AuthUserInput`, but the `authorize()` function passes the raw DB user (which satisfies `AuthUserInput` due to the index signature). The recruiting-token.ts function manually constructs an `AuthenticatedLoginUser` (a separate type) without going through `mapUserToAuthFields`.

  This creates a 4-way drift risk: adding a new preference field requires updating `AUTH_PREFERENCE_FIELDS`, `AuthUserRecord`, `AuthUserInput`, AND `authorizeRecruitingToken`.
- **Suggested fix:** (1) Remove the index signature from `AuthUserInput` and use an explicit intersection type for DB user pass-through. (2) Refactor `authorizeRecruitingToken` to use `mapUserToAuthFields`. (3) Consider making `AuthenticatedLoginUser` extend the output of `mapUserToAuthFields` instead of `AuthUserRecord`.

### CR12-AR2 — [MEDIUM] Dashboard layout has dual header — PublicHeader + SidebarInset header — visual hierarchy confusion

- **File:** `src/app/(dashboard)/layout.tsx:72-93, 104-110`
- **Confidence:** MEDIUM
- **Evidence:** The dashboard layout renders both `PublicHeader` (the top navigation bar from Phase 3 of the workspace-to-public migration) AND a `SidebarInset` header (lines 105-110) containing the sidebar trigger and lecture mode toggle. This creates a double-header visual pattern:
  - Top: PublicHeader with site nav, theme/locale toggle, user dropdown
  - Below: Sidebar header with hamburger trigger, lecture mode toggle

  This is the expected Phase 3 intermediate state per the migration plan, but it's worth noting as a UX issue that should be resolved in Phase 3 completion (moving breadcrumb to top navbar, slimming sidebar).
- **Suggested fix:** Continue Phase 3 as planned — move the sidebar trigger and lecture toggle into the PublicHeader, and remove the SidebarInset header.

### CR12-AR3 — [LOW] SSE route still 475 lines despite cycle 11 AGG-4 noting it should be refactored

- **File:** `src/app/api/v1/submissions/[id]/events/route.ts`
- **Confidence:** HIGH
- **Evidence:** This was identified as AGG-4 in cycle 11 and deferred (D3). It remains 475 lines with connection tracking, polling, and route handler all in one file. The two terminal-result-fetch blocks (lines 348-367 and 392-410) are nearly identical. This is a carry-forward from the deferred list.
- **Suggested fix:** Dedicate a cycle to SSE refactoring as planned.

### CR12-AR4 — [LOW] `navGroups` in AppSidebar uses hardcoded navigation structure — not configurable

- **File:** `src/components/layout/app-sidebar.tsx:56-112`
- **Confidence:** LOW
- **Evidence:** The navigation items in `navGroups` and `adminGroups` are hardcoded as module-level constants. Adding or removing a navigation item requires a code change. For a platform that supports plugin-based navigation (e.g., chat-widget), this is limiting.
- **Suggested fix:** Low priority. Consider a navigation registry pattern in the future.

## Previously Deferred Items Still Valid

- D3: SSE route refactoring (MEDIUM)
- D4: SSE capability check incomplete (MEDIUM)
- D5: Test coverage gaps for workspace-to-public migration (MEDIUM)
