# Cycle 13 Code Reviewer Report

**Date:** 2026-04-19
**Base commit:** e8340da5
**Reviewer angle:** Code quality, logic, SOLID, maintainability

---

## CR13-CR1 — [MEDIUM] Public layout and dashboard layout duplicate PublicHeader item configuration

- **File:** `src/app/(public)/layout.tsx:29-35` and `src/app/(dashboard)/layout.tsx:74-81`
- **Confidence:** HIGH
- **Evidence:** Both layouts manually construct the same `items` array with the same 6 navigation links (practice, playground, contests, rankings, community, languages) and the same `actions` array. The public layout uses `tShell("nav.practice")` for labels while the dashboard layout uses `t("practice")`. If a navigation item is added/removed, both files must be updated in lockstep. This is a DRY violation that will inevitably lead to drift.
- **Scenario:** A new public page "Blog" is added. Developer updates `public/layout.tsx` but forgets `dashboard/layout.tsx`. Dashboard users don't see the new nav item.
- **Suggested fix:** Extract a shared `getPublicNavItems(t)` helper or define nav items in a single config file consumed by both layouts.

## CR13-CR2 — [MEDIUM] `getDropdownItems` fallback role checks are fragile — hardcoded role names bypass capability system

- **File:** `src/components/layout/public-header.tsx:70-72`
- **Confidence:** HIGH
- **Evidence:** When `capabilities` is undefined, `getDropdownItems` falls back to hardcoded `role === "instructor" || role === "admin" || role === "super_admin"` checks. This duplicates the authorization logic and breaks for custom roles that have equivalent capabilities but different names. The comment says "falls back to role-based checks for backwards compatibility" but the fallback is actively used — both layouts always pass capabilities when the user is logged in, but the type allows `undefined`.
- **Scenario:** A custom role "teaching_assistant" is created with `problems.create` capability. The public header dropdown does not show the "Problems" link because the fallback only checks built-in role names.
- **Suggested fix:** Make `capabilities` required when `loggedInUser` is present (remove the optional). Remove the fallback entirely. If capabilities cannot be resolved, render no dropdown items rather than guessing from role names.

## CR13-CR3 — [LOW] `(control)` layout duplicates navigation links that already exist in `AppSidebar`/`PublicHeader`

- **File:** `src/app/(control)/layout.tsx:53-57`
- **Confidence:** MEDIUM
- **Evidence:** The control layout sidebar includes links to `/dashboard/groups`, `/dashboard/admin/users`, `/dashboard/admin/languages`, `/dashboard/admin/settings` — all of which are already in `AppSidebar` and `PublicHeader`. This is navigation duplication that creates maintenance burden. Per the migration plan, `(control)` should eventually merge into `(dashboard)/admin`.
- **Suggested fix:** Track as part of Phase 3 migration work — merge `(control)` into `(dashboard)`.

## CR13-CR4 — [LOW] `recordRateLimitFailureMulti` has slightly different `windowStartedAt` logic than `recordRateLimitFailure`

- **File:** `src/lib/security/rate-limit.ts:251-252` vs `213-214`
- **Confidence:** MEDIUM
- **Evidence:** `recordRateLimitFailureMulti` has the ternary `entry.windowStartedAt === now ? now : entry.windowStartedAt` at line 252, while `recordRateLimitFailure` simply uses `entry.windowStartedAt` at line 214. The ternary appears to be a no-op (if `entry.windowStartedAt === now`, assigning `now` is identical). This is confusing but harmless — it was likely an incomplete attempt to handle a special case.
- **Suggested fix:** Normalize both functions to use `entry.windowStartedAt` without the ternary, and add a comment explaining the intent.

## CR13-CR5 — [LOW] `handleSignOut` in `AppSidebar` is declared as `async` but only uses `await` at the end

- **File:** `src/components/layout/app-sidebar.tsx:236-247`
- **Confidence:** LOW
- **Evidence:** The function is `async` and uses `await signOut()`, but the `localStorage.clear()` and `sessionStorage.clear()` before it are synchronous. If `signOut` throws, the storage has already been cleared. This is not a bug but the ordering means that even a failed sign-out clears storage. The `void handleSignOut()` call at line 325 means any error from `signOut` is silently swallowed.
- **Suggested fix:** Wrap `signOut` in a try/catch or use `.catch()` on the voided promise to surface errors.

## CR13-CR6 — [LOW] `validateExport` does not check for duplicate table names in input

- **File:** `src/lib/db/export.ts:307-308` (carried from D19/D20)
- **Confidence:** LOW
- **Evidence:** The validation loop iterates over `Object.entries(tables)`. If the input JSON has duplicate keys (which JSON.parse silently resolves by keeping the last one), validation won't detect the issue. This is already deferred (D19/D20) but worth noting as still present.

---

## Final Sweep

- All source files under `src/lib/auth/` were reviewed. The `recruiting-token.ts` refactoring from cycle 12 is clean and correctly delegates to `mapUserToAuthFields`.
- The `capabilities/cache.ts` module is well-structured with proper TTL handling and super_admin safety.
- The `session-security.ts` `AUTH_TOKEN_FIELDS` derivation from `AUTH_PREFERENCE_FIELDS` is correct and eliminates the previous field-list duplication.
- The `export.ts` module correctly handles BigInt normalization (added in a prior cycle).
