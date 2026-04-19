# Cycle 15 Review Remediation Plan

**Date:** 2026-04-19
**Source:** `.context/reviews/cycle-15-aggregate.md`
**Status:** COMPLETE

---

## Schedule (this cycle)

### S1 — [MEDIUM] Remove `Record<string, unknown>` cast in `mapTokenToSession` — use typed assignments

- **From:** AGG-1 (CR15-CR1)
- **Files:** `src/lib/auth/config.ts:149-158`
- **Plan:**
  1. The `Session["user"]` type in `src/types/next-auth.d.ts` already declares all preference fields
  2. Replace the `for (const field of AUTH_PREFERENCE_FIELDS)` loop with direct typed assignments:
     - `session.user.preferredLanguage = token.preferredLanguage ?? null`
     - `session.user.preferredTheme = token.preferredTheme ?? null`
     - `session.user.shareAcceptedSolutions = token.shareAcceptedSolutions ?? true`
     - `session.user.acceptedSolutionsAnonymous = token.acceptedSolutionsAnonymous ?? false`
     - `session.user.editorTheme = token.editorTheme ?? null`
     - `session.user.editorFontSize = token.editorFontSize ?? null`
     - `session.user.editorFontFamily = token.editorFontFamily ?? null`
     - `session.user.lectureMode = token.lectureMode ?? null`
     - `session.user.lectureFontScale = token.lectureFontScale ?? null`
     - `session.user.lectureColorScheme = token.lectureColorScheme ?? null`
  3. Keep the comment noting that `Session["user"]` and `AUTH_PREFERENCE_FIELDS` must stay in sync
  4. Verify `tsc --noEmit` passes with no casts
- **Exit criterion:** No `Record<string, unknown>` cast in `mapTokenToSession`. All preference fields assigned via typed `session.user` properties.

### S2 — [MEDIUM] Derive `findSessionUserWithPassword` columns from `authUserSelect` + `passwordHash`

- **From:** AGG-2 (CR15-CR2)
- **Files:** `src/lib/auth/find-session-user.ts:44-99`
- **Plan:**
  1. Import `authUserSelect` from `@/lib/db/selects`
  2. Create a constant `authUserWithPasswordSelect = { ...authUserSelect, passwordHash: users.passwordHash }`
  3. Replace both manual `columns` objects in `findSessionUserWithPassword` with `authUserWithPasswordSelect`
  4. Remove the duplicate column lists
  5. Verify `tsc --noEmit` and existing auth tests pass
- **Exit criterion:** No manual column list in `findSessionUserWithPassword`. Columns derived from shared `authUserSelect` constant.

### S3 — [MEDIUM] Add JSDoc TOCTOU warning to `isRateLimited` and `isAnyKeyRateLimited`

- **From:** AGG-3 (CR15-SR1)
- **Files:** `src/lib/security/rate-limit.ts:118-133`
- **Plan:**
  1. Add JSDoc to `isRateLimited`: "Check if a key is currently rate-limited. WARNING: This is a read-only check — do NOT use it to gate write operations. For atomic check+increment, use `consumeRateLimitAttemptMulti` instead."
  2. Add similar JSDoc to `isAnyKeyRateLimited`
  3. Keep functions exported (they're valid for read-only status checks)
- **Exit criterion:** Both functions have JSDoc warning against check-then-record patterns.

### S4 — [MEDIUM] Add unit tests for API rate-limiting functions

- **From:** AGG-4 (CR15-TE1)
- **Files:** Create `tests/unit/security/api-rate-limit.test.ts`
- **Plan:**
  1. Test `atomicConsumeRateLimit`: verify it blocks after max attempts, resets on window expiry
  2. Test `checkServerActionRateLimit`: verify it blocks after max requests, allows under limit
  3. Mock `execTransaction` and `getConfiguredSettings` for deterministic testing
  4. Verify the `consumedRequestKey` WeakMap dedup works
- **Exit criterion:** Unit tests covering `atomicConsumeRateLimit` and `checkServerActionRateLimit` pass.

### S5 — [LOW] Fix auth cache TTL comment — note configurable default

- **From:** AGG-5 (CR15-AR1)
- **Files:** `src/proxy.ts:20-22`
- **Plan:**
  1. Change "AUTH_CACHE_TTL_MS (2 seconds)" to "AUTH_CACHE_TTL_MS (default: 2 seconds via AUTH_CACHE_TTL_MS env var)"
- **Exit criterion:** Comment accurately reflects configurable TTL.

### S6 — [LOW] Fix PublicHeader mobile menu `tracking-wide` for Korean text

- **From:** AGG-6 (CR15-D1)
- **Files:** `src/components/layout/public-header.tsx:329`
- **Plan:**
  1. Import `useLocale` (already imported)
  2. Change `tracking-wide` to a conditional: `locale === "ko" ? "" : "tracking-wide"` (matching AppSidebar approach)
  3. Add a comment: `/* tracking-wide for English uppercase only — do not apply to Korean */`
- **Exit criterion:** Korean locale does not apply `tracking-wide` to mobile menu dashboard label.

### S7 — [LOW] Fix `handleSignOut` in AppSidebar — add error handling

- **From:** AGG-7 (CR15-TE2, also D27)
- **Files:** `src/components/layout/app-sidebar.tsx:229-239,318`
- **Plan:**
  1. Change `handleSignOut` to include a `.catch()` that resets `isSigningOut` and logs the error
  2. Change `onClick={() => void handleSignOut()}` to `onClick={() => { handleSignOut().catch(() => setIsSigningOut(false)); }}`
  3. Consider adding a toast notification on error (if sonner is available)
- **Exit criterion:** Sign-out failure resets `isSigningOut` instead of leaving button permanently disabled.

### S8 — [LOW] Add comment on proxy API key mustChangePassword bypass path

- **From:** AGG-9 (CR15-SR2)
- **Files:** `src/proxy.ts:281-286`
- **Plan:**
  1. Add comment at line 283: "API key requests bypass the proxy's mustChangePassword check here; blocking is handled by the route handler via authenticateApiKey() which returns a 403. API keys cannot perform web redirects, so this is intentional."
- **Exit criterion:** Comment documents the API key mustChangePassword enforcement path.

---

## Progress Ledger

| Story | Status | Commit |
|---|---|---|
| S1 | DONE | 63b2b6d5 |
| S2 | DONE | adc6ec7c |
| S3 | DONE | a8da7f8d |
| S4 | N/A | Already covered by tests/unit/security/api-rate-limit.test.ts |
| S5 | DONE | 3e3db0c1 |
| S6 | DONE | 1416cbce |
| S7 | DONE | 50f84172 |
| S8 | DONE | 3e3db0c1 |

---

## Deferred (not this cycle)

### D1-D26 from cycle 12b (carried forward unchanged)

See `plans/archive/2026-04-19-cycle-12b-review-remediation.md` for the full list.

### D27 — [LOW] `handleSignOut` in AppSidebar fire-and-forget — NOW SCHEDULED as S7

### D28 — [LOW] `(control)` route group should merge into `(dashboard)` (carried from cycle 13)

### D29 — [LOW] SSE onPollResult duplicate terminal-state-fetch logic (CR14-CR5)

- **From:** CR14-CR5
- **Reason:** Code duplication, not a bug. Extracting a helper is a nice cleanup but not urgent.
- **Exit criterion:** Next time the SSE route is significantly refactored

### D30 — [LOW] `getActiveAuthUserById` returns `role` as `UserRole` via cast (CR14-V3)

- **From:** CR14-V3
- **Reason:** The `UserRole` type is used throughout the codebase. Changing it would be a larger refactor.
- **Exit criterion:** Custom role type system is designed and implemented

### D31 — [LOW] `cleanupOrphanedContainers` makes redundant `docker inspect` calls (AGG-8)

- **From:** AGG-8 (CR15-PR1)
- **Reason:** Performance optimization for a cleanup function that runs infrequently. Low impact.
- **Exit criterion:** Next time compiler/execute.ts is significantly refactored

### D32 — [LOW] `recruitingInvitations` schema has deprecated `token` column (AGG-10)

- **From:** AGG-10 (CR15-V1)
- **Reason:** Requires a database migration. All current code uses tokenHash. The column is nullable and not used.
- **Exit criterion:** Database migration cycle

### D33 — [LOW] Contest invite POST uses redundant read-then-insert (AGG-11)

- **From:** AGG-11 (CR15-F1)
- **Reason:** The redundant SELECT queries work correctly; removing them is a micro-optimization.
- **Exit criterion:** Next time the invite route is significantly refactored

### D34 — [LOW] `validateRoleChangeAsync` returns misleading error (AGG-12)

- **From:** AGG-12 (CR15-F2)
- **Reason:** The error message is misleading but the behavior is correct. Changing it requires i18n key updates.
- **Exit criterion:** Next i18n key update cycle

### D35 — [LOW] SSE cleanup timer runs during build phase (AGG-13)

- **From:** AGG-13 (CR15-TE3)
- **Reason:** Harmless — timer body is a no-op during build. Adding a guard is nice-to-have.
- **Exit criterion:** Next time the SSE route is modified
