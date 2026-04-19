# Cycle 14 Review Remediation Plan

**Date:** 2026-04-19
**Source:** `.context/reviews/cycle-14-aggregate.md`
**Status:** COMPLETE

---

## Schedule (this cycle)

### S1 — [MEDIUM] Fix `changePassword` TOCTOU race — replace check-then-record with atomic `consumeRateLimitAttemptMulti`

- **From:** AGG-1 (CR14-CR1, CR14-SR1/SR2, CR14-CT1, CR14-DB1, CR14-TE1, tracer Flow 1)
- **Files:** `src/lib/actions/change-password.ts:40-53`
- **Plan:**
  1. Replace `isRateLimited(rateLimitKey)` + `recordRateLimitFailure(rateLimitKey)` with `consumeRateLimitAttemptMulti(rateLimitKey)` at the start of the function
  2. If `consumeRateLimitAttemptMulti` returns `true`, return `{ success: false, error: "changePasswordRateLimited" }` immediately
  3. Remove the `recordRateLimitFailure` call after wrong password — the attempt was already consumed atomically
  4. Keep `clearRateLimit(rateLimitKey)` on success (already present at line 80)
  5. Verify the change-password tests still pass
- **Exit criterion:** No `isRateLimited` or `recordRateLimitFailure` calls in `changePassword`. Rate limit check and increment happen atomically in a single transaction.

### S2 — [MEDIUM] Fix API key auth `mustChangePassword: false` — read actual DB value

- **From:** AGG-2 (CR14-SR3, CR14-AR3, tracer Flow 2)
- **Files:** `src/lib/api/api-key-auth.ts:121`
- **Plan:**
  1. The DB query at lines 89-93 already fetches `authUserSelect` which includes `mustChangePassword`
  2. Replace `mustChangePassword: false` with `mustChangePassword: Boolean(user.mustChangePassword)` at line 121
  3. Verify the middleware's forced-password-change check works for API key auth
  4. Consider whether API key requests should be blocked by mustChangePassword (they should — it's a security policy)
- **Exit criterion:** `authenticateApiKey` returns the actual `mustChangePassword` value from the DB, not hardcoded `false`.

### S3 — [MEDIUM] Extend NextAuth `Session` type to include preference fields — remove unsafe cast in `mapTokenToSession`

- **From:** AGG-3 (CR14-V1)
- **Files:** `src/lib/auth/config.ts:148-158`, create or extend `src/types/next-auth.d.ts`
- **Plan:**
  1. Check if a `next-auth.d.ts` or module augmentation already exists for `Session["user"]`
  2. Add a module augmentation that extends `Session["user"]` with all preference fields from `AUTH_PREFERENCE_FIELDS` plus `className` and `mustChangePassword`
  3. In `mapTokenToSession`, replace `(session.user as Record<string, unknown>)[field]` with direct assignment to the typed `session.user` fields
  4. Verify `tsc --noEmit` passes
- **Exit criterion:** No `Record<string, unknown>` cast in `mapTokenToSession`. All preference fields are properly typed on `session.user`.

### S4 — [LOW] Normalize `recordRateLimitFailureMulti` insert to use `entry.windowStartedAt`

- **From:** AGG-4 (CR14-CR2, CR14-CT2, CR14-DB3, tracer Flow 3)
- **Files:** `src/lib/security/rate-limit.ts:261`
- **Plan:**
  1. Change `windowStartedAt: now` to `windowStartedAt: entry.windowStartedAt` at line 261
  2. This matches the pattern in `recordRateLimitFailure` (line 225) and `consumeRateLimitAttemptMulti` (line 184)
- **Exit criterion:** All three rate-limit functions use `entry.windowStartedAt` consistently for inserts.

### S5 — [LOW] Remove dead-code sync role-helper functions: `isAtLeastRole`, `canManageUsers`, `isInstructorOrAbove`

- **From:** AGG-5 (CR14-CR3/CR4, CR14-AR2)
- **Files:** `src/lib/auth/role-helpers.ts:11-13,30-32,46-48`
- **Plan:**
  1. Verify zero callers with grep (confirmed: only definitions and internal references)
  2. Remove `isAtLeastRole` (lines 11-13), `canManageUsers` (lines 30-32), `isInstructorOrAbove` (lines 46-48)
  3. Keep async versions: `isAtLeastRoleAsync`, `canManageUsersAsync`, `isInstructorOrAboveAsync`
  4. Verify `tsc --noEmit` passes
- **Exit criterion:** No sync `isAtLeastRole`, `canManageUsers`, or `isInstructorOrAbove` functions exported from `role-helpers.ts`.

### S6 — [LOW] Add documentation: API rate limit `consecutiveBlocks`, `AUTH_PREFERENCE_FIELDS` exclusion, `recordRateLimitFailure` non-atomic warning

- **From:** AGG-6 (CR14-CR6, CR14-CT3, CR14-TE4, CR14-DOC3), AGG-8 (CR14-V2, CR14-DOC1), AGG-9 (CR14-DOC2)
- **Files:** `src/lib/security/api-rate-limit.ts:70-81`, `src/lib/auth/types.ts:1-7`, `src/lib/security/rate-limit.ts:195`
- **Plan:**
  1. Add comment in `api-rate-limit.ts` atomicConsumeRateLimit: "API rate limits use fixed blocking without exponential backoff (consecutiveBlocks is always 0)."
  2. Add note in `AUTH_PREFERENCE_FIELDS` JSDoc: "Security fields (mustChangePassword, isActive, tokenInvalidatedAt) are NOT preference fields and are handled separately in AUTH_CORE_FIELDS."
  3. Add JSDoc to `recordRateLimitFailure`: "Record a failed attempt for the given key. NOTE: This function is not atomic — callers that need check+increment in one transaction should use `consumeRateLimitAttemptMulti` instead."
- **Exit criterion:** All three documentation gaps addressed.

### S7 — [LOW] Normalize `api-rate-limit.ts` insert pattern — remove explicit `id: nanoid()`, rely on schema default

- **From:** AGG-7 (CR14-DB2)
- **Files:** `src/lib/security/api-rate-limit.ts:71`
- **Plan:**
  1. Remove `id: nanoid()` from the insert values in `atomicConsumeRateLimit` (line 71)
  2. The schema `$defaultFn(() => nanoid())` will provide the ID automatically
  3. This matches the pattern used in `rate-limit.ts` which does NOT include `id` in inserts
  4. Verify tests pass
- **Exit criterion:** `api-rate-limit.ts` inserts do not include explicit `id` field.

### S8 — [LOW] Add "contests" to PublicHeader dropdown items

- **From:** AGG-10 (CR14-D1, CR14-V4)
- **Files:** `src/components/layout/public-header.tsx:75-93`
- **Plan:**
  1. Add a "contests" entry after the "mySubmissions" entry in `getDropdownItems`
  2. No capability check needed — all authenticated users can see contests
  3. Use the Timer icon (already imported)
  4. The i18n key `nav.contests` should already exist in `publicShell` namespace
- **Exit criterion:** PublicHeader dropdown includes "contests" link for authenticated users.

---

## Progress Ledger

| Story | Status | Commit |
|---|---|---|
| S1 | COMPLETE | 076c08ae |
| S2 | COMPLETE | 433e481b |
| S3 | COMPLETE | eb68b0b9 |
| S4 | COMPLETE | fa32dab7 |
| S5 | COMPLETE | 20a9be25 |
| S6 | COMPLETE | 759bcf77 |
| S7 | COMPLETE | cc4b37fd |
| S8 | COMPLETE | a0dddfde |

---

## Deferred (not this cycle)

### D1-D26 from cycle 12b (carried forward unchanged)

See `plans/archive/2026-04-19-cycle-12b-review-remediation.md` for the full list.

### D27 — [LOW] `handleSignOut` in `AppSidebar` fires async with `void` — errors silently swallowed (carried from cycle 13)

### D28 — [LOW] `(control)` route group should merge into `(dashboard)` (carried from cycle 13)

### D29 — [LOW] SSE onPollResult duplicate terminal-state-fetch logic (CR14-CR5)

- **From:** CR14-CR5
- **Reason:** Code duplication, not a bug. Extracting a helper is a nice cleanup but not urgent.
- **Exit criterion:** Next time the SSE route is significantly refactored

### D30 — [LOW] `getActiveAuthUserById` returns `role` as `UserRole` via cast — custom roles not properly typed (CR14-V3)

- **From:** CR14-V3
- **Reason:** The `UserRole` type is used throughout the codebase. Changing it would be a larger refactor.
- **Exit criterion:** Custom role type system is designed and implemented
