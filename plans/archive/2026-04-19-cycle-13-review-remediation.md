# Cycle 13 Review Remediation Plan

**Date:** 2026-04-19
**Source:** `.context/reviews/cycle-13-aggregate.md`
**Status:** COMPLETE

---

## Schedule (this cycle)

### S1 — [MEDIUM] Fix dashboard layout i18n namespace — nav items use `common.practice` which doesn't exist

- **From:** AGG-1 (CR13-CR1, CR13-SR1, CR13-AR1, CR13-CT1, CR13-V1, CR13-TE1, CR13-D1)
- **Files:** `src/app/(dashboard)/layout.tsx:33-81`
- **Evidence:** The dashboard layout uses `getTranslations("common")` and passes `t("practice")`, `t("playground")`, etc. as PublicHeader item labels. But these keys don't exist in the `common` namespace — they're under `publicShell.nav`. This means the dashboard's PublicHeader nav items are rendering with untranslated i18n keys instead of actual labels.
- **Fix:**
  1. Add `getTranslations("publicShell")` alongside `getTranslations("common")` in the dashboard layout
  2. Change the `items` labels to use `tShell("nav.practice")`, `tShell("nav.playground")`, etc. (matching the public layout)
  3. Change the `actions` labels to use `tAuth("signIn")` and `tAuth("signUp")` (matching the public layout)
- **Status:** COMPLETE (4389523c)

- **From:** AGG-1 (same as S1 — addressing the root cause)
- **Files:** Create `src/lib/navigation/public-nav.ts`, modify `src/app/(public)/layout.tsx`, `src/app/(dashboard)/layout.tsx`
- **Fix:**
  1. Create a shared `getPublicNavItems(tShell)` function that returns the items array
  2. Create a shared `getPublicNavActions(tAuth, signupEnabled)` function that returns the actions array
  3. Use these in both public and dashboard layouts
- **Status:** COMPLETE (4389523c)

- **From:** AGG-2 (CR13-DB1, CR13-V2/V3, tracer Flow 2)
- **Files:** `src/lib/auth/config.ts:119-137`
- **Fix:**
  1. Replace the manual `token.fieldName = fields.fieldName` assignments with `Object.assign(token, fields)`
  2. Preserve `token.authenticatedAt = authenticatedAtSeconds` after the Object.assign
  3. Verify `tsc --noEmit` passes
- **Status:** COMPLETE (8dc88e08)

- **From:** AGG-2 (CR13-DB2, CR13-V3)
- **Files:** `src/lib/auth/config.ts:147-168`
- **Fix:**
  1. Use a loop over `AUTH_PREFERENCE_FIELDS` for preference field assignments in `mapTokenToSession`
  2. Keep core field assignments (id, role, username, etc.) explicit since they have different default patterns
  3. Verify `tsc --noEmit` passes
- **Status:** COMPLETE (8dc88e08)

- **From:** AGG-3 (CR13-CR2, CR13-SR1, tracer Flow 3)
- **Files:** `src/components/layout/public-header.tsx:67-72`
- **Fix:**
  1. Remove the fallback `role === "instructor" || ...` checks from `getDropdownItems`
  2. If `capabilities` is undefined/null, return only items that don't require any capability (dashboard, submissions, profile)
  3. Add a comment explaining that capabilities are always provided when the user is logged in
- **Status:** COMPLETE (cb2ec48c)

- **From:** AGG-5 (CR13-CR4, CR13-CT3)
- **Files:** `src/lib/security/rate-limit.ts:251-252`
- **Fix:**
  1. Replace `entry.windowStartedAt === now ? now : entry.windowStartedAt` with `entry.windowStartedAt`
- **Status:** COMPLETE (0105c4d3)

- **From:** AGG-4 (CR13-AR2, CR13-CT2, CR13-D1), migration plan Phase 3
- **Files:** `src/components/layout/app-sidebar.tsx`, `src/app/(dashboard)/layout.tsx`
- **Fix:**
  1. Evaluate whether to convert AppSidebar to icon-only mode or remove items that are already in PublicHeader
  2. At minimum, remove the duplicate navigation items from AppSidebar that are already accessible via PublicHeader dropdown (dashboard, problems, groups, submissions, profile, admin)
  3. Keep AppSidebar items that are NOT in PublicHeader (contests, compiler, rankings, problem sets)
- **Status:** COMPLETE (9bba87d3)

---

## Progress Ledger

| Story | Status | Commit |
|---|---|---|
| S1 | COMPLETE | 4389523c |
| S2 | COMPLETE | 4389523c |
| S3 | COMPLETE | 8dc88e08 |
| S4 | COMPLETE | 8dc88e08 |
| S5 | COMPLETE | cb2ec48c |
| S6 | COMPLETE | 0105c4d3 |
| S7 | COMPLETE | 9bba87d3 |

---

## Deferred (not this cycle)

### D1-D26 from cycle 12b (carried forward unchanged)

See `plans/open/2026-04-19-cycle-12b-review-remediation.md` for the full list.

### D27 — [LOW] `handleSignOut` in `AppSidebar` fires async with `void` — errors silently swallowed (AGG-6)

- **From:** AGG-6 (CR13-CR5, CR13-DB3)
- **Reason:** `next-auth/react` `signOut` is well-behaved. Adding `.catch()` is a minor robustness improvement.
- **Exit criterion:** Next time the AppSidebar component is significantly refactored

### D28 — [LOW] `(control)` route group should merge into `(dashboard)` (AGG-4, CR13-AR2)

- **From:** AGG-4 (CR13-AR2, CR13-CT2)
- **Reason:** Part of workspace-to-public migration Phase 3. Larger scope that should be planned separately.
- **Exit criterion:** Phase 3 sidebar work is complete; then plan the control group merge
