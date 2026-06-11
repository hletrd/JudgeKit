# Cycle 13 Aggregate Review (review-plan-fix loop)

## Scope
- Aggregated from: `cycle-13-code-reviewer.md`, `cycle-13-security-reviewer.md`, `cycle-13-perf-reviewer.md`, `cycle-13-architect.md`, `cycle-13-critic.md`, `cycle-13-verifier.md`, `cycle-13-test-engineer.md`, `cycle-13-debugger.md`, `cycle-13-tracer.md`, `cycle-13-designer.md`
- Base commit: e8340da5

## Deduped findings

### AGG-1 — [MEDIUM] Navigation item configuration is duplicated across public and dashboard layouts — DRY violation and i18n inconsistency

- **Severity:** MEDIUM (maintainability + correctness — i18n labels may diverge)
- **Confidence:** HIGH
- **Cross-agent agreement:** code-reviewer CR13-CR1, security-reviewer CR13-SR1, architect CR13-AR1, critic CR13-CT1, verifier CR13-V1, test-engineer CR13-TE1, designer CR13-D1
- **Files:** `src/app/(public)/layout.tsx:29-35`, `src/app/(dashboard)/layout.tsx:74-81`
- **Evidence:** Both layouts manually construct the same `items` array for `PublicHeader` with the same 6 navigation links. The public layout uses `tShell("nav.practice")` (from `publicShell` namespace) while the dashboard layout uses `t("practice")` (from `common` namespace). If these i18n keys resolve to different strings, users see different labels for the same nav item when switching between public and dashboard pages. Any navigation change requires updating both files in lockstep.
- **Suggested fix:** Extract a shared `getPublicNavItems(t)` helper or config file that both layouts consume. Unify the i18n namespace for navigation labels.

### AGG-2 — [MEDIUM] `syncTokenWithUser` and `mapTokenToSession` use manual field assignments that will silently miss new preference fields

- **Severity:** MEDIUM (correctness — same class of bug that caused the shareAcceptedSolutions issue in cycle 10)
- **Confidence:** HIGH
- **Cross-agent agreement:** debugger CR13-DB1, verifier CR13-V2/V3, tracer Flow 2
- **Files:** `src/lib/auth/config.ts:119-137` (syncTokenWithUser), `src/lib/auth/config.ts:147-168` (mapTokenToSession)
- **Evidence:** After calling `mapUserToAuthFields(user)`, both `syncTokenWithUser` and `mapTokenToSession` manually assign each field to the token/session object (e.g., `token.preferredLanguage = fields.preferredLanguage`). If a new preference field is added to `AUTH_PREFERENCE_FIELDS` and `mapUserToAuthFields` but NOT to these two functions, the JWT token and session will silently miss the field. This is the exact same class of bug that caused the `shareAcceptedSolutions` issue in cycle 10 — the field was added to the DB and the query but not to the token mapping.
- **Failure scenario:** New field `preferredFontSize` is added to `AUTH_PREFERENCE_FIELDS` and `mapUserToAuthFields`. Developer forgets to add `token.preferredFontSize = fields.preferredFontSize` in `syncTokenWithUser`. JWT token misses the field. User changes their font size preference but it never takes effect until the next login.
- **Suggested fix:** Replace manual assignments in `syncTokenWithUser` with `Object.assign(token, fields)` (preserving `token.authenticatedAt` separately). Similarly, iterate over `AUTH_PREFERENCE_FIELDS` in `mapTokenToSession` instead of manual assignments. This makes both functions automatically pick up any new field added to `mapUserToAuthFields`.

### AGG-3 — [MEDIUM] `getDropdownItems` fallback role checks are fragile — hardcoded role names bypass the capability system for custom roles

- **Severity:** MEDIUM (authz inconsistency — custom roles with equivalent capabilities get wrong nav items)
- **Confidence:** MEDIUM
- **Cross-agent agreement:** code-reviewer CR13-CR2, security-reviewer CR13-SR1, tracer Flow 3
- **Files:** `src/components/layout/public-header.tsx:70-72`
- **Evidence:** When `capabilities` is undefined, `getDropdownItems` falls back to hardcoded `role === "instructor" || role === "admin" || role === "super_admin"` checks. In current usage, capabilities are always provided when the user is logged in, so the fallback is effectively dead code. However, the fallback exists and would produce incorrect results for custom roles if activated by a future refactor. The fallback also creates a maintenance burden — capability changes must be reflected in two places.
- **Suggested fix:** Make `capabilities` required when `loggedInUser` is present. Remove the fallback entirely. If capabilities cannot be resolved, render no dropdown items rather than guessing from role names.

### AGG-4 — [MEDIUM] Dashboard layout shows duplicate navigation — sidebar and PublicHeader dropdown both show same links

- **Severity:** MEDIUM (UX — navigation confusion)
- **Confidence:** HIGH
- **Cross-agent agreement:** architect CR13-AR2, critic CR13-CT2, designer CR13-D1
- **Files:** `src/app/(dashboard)/layout.tsx:72-95` (PublicHeader) and `src/app/(dashboard)/layout.tsx:97-104` (AppSidebar)
- **Evidence:** The dashboard layout now shows both the PublicHeader dropdown (Dashboard, Problems, Groups, Submissions, Profile, Admin) AND the full AppSidebar with the same links. Users see the same navigation in two places with different visual presentations. This is a known Phase 3 intermediate state from the workspace-to-public migration plan.
- **Suggested fix:** Slim down AppSidebar to icon-only mode or contextual sub-navigation. This is tracked in the migration plan Phase 3 remaining work.

### AGG-5 — [LOW] `recordRateLimitFailureMulti` has slightly different `windowStartedAt` logic than `recordRateLimitFailure`

- **Severity:** LOW (correctness — no practical impact, code smell)
- **Confidence:** MEDIUM
- **Cross-agent agreement:** code-reviewer CR13-CR4, critic CR13-CT3
- **Files:** `src/lib/security/rate-limit.ts:251-252` vs `213-214`
- **Evidence:** `recordRateLimitFailureMulti` has the ternary `entry.windowStartedAt === now ? now : entry.windowStartedAt` while `recordRateLimitFailure` simply uses `entry.windowStartedAt`. The ternary is a no-op (assigning `now` when the value is already `now` is identical). It adds confusion about the intended behavior.
- **Suggested fix:** Normalize both functions to use `entry.windowStartedAt` without the ternary.

### AGG-6 — [LOW] `handleSignOut` in `AppSidebar` fires async function with `void` — errors silently swallowed

- **Severity:** LOW (robustness — unhandled promise rejection)
- **Confidence:** LOW
- **Cross-agent agreement:** code-reviewer CR13-CR5, debugger CR13-DB3
- **Files:** `src/components/layout/app-sidebar.tsx:325`
- **Evidence:** `void handleSignOut()` means any unhandled rejection from `signOut` becomes an unhandled promise rejection. The `next-auth/react` `signOut` is generally well-behaved, but network errors could cause it to throw.
- **Suggested fix:** Add `.catch()` to the voided promise or wrap `signOut` in try/catch.

## Test Coverage Gaps (Priority Order)

1. PublicHeader navigation item consistency across layouts (AGG-1)
2. `syncTokenWithUser` / `mapTokenToSession` field completeness (AGG-2)
3. `getDropdownItems` capability-based filtering (carried from D22)
4. `mapUserToAuthFields` return type completeness vs AuthUserRecord (carried from D21)

## Previously Deferred Items (Carried Forward)

- D1-D26 from cycle 12b aggregate (all carried forward unchanged — see `cycle-12-aggregate.md`)

## Agent Failures

None — all reviews completed successfully.
