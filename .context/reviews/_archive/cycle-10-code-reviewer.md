# Cycle 10 Code Reviewer Report

**Reviewer:** code-reviewer
**Date:** 2026-04-19
**Base commit:** 56e78d62
**Scope:** Full codebase review focusing on code quality, logic, SOLID, maintainability

## Inventory of Files Reviewed

- `src/lib/auth/config.ts` — NextAuth configuration, field mapping
- `src/lib/auth/types.ts` — AuthUserRecord type
- `src/lib/auth/session-security.ts` — Token clearing/invalidation
- `src/lib/auth/permissions.ts` — Access control functions
- `src/lib/api/handler.ts` — API handler factory
- `src/lib/api/auth.ts` — API auth helpers
- `src/lib/db/export.ts` — Database export engine
- `src/lib/db/import.ts` — Database import engine
- `src/lib/db/schema.pg.ts` — DB schema
- `src/lib/db/selects.ts` — Query column selects
- `src/lib/security/encryption.ts` — AES-256-GCM encryption
- `src/lib/security/rate-limit.ts` — Login rate limiting
- `src/lib/security/api-rate-limit.ts` — API rate limiting
- `src/lib/security/csrf.ts` — CSRF protection
- `src/lib/security/sanitize-html.ts` — HTML sanitization
- `src/lib/compiler/execute.ts` — Docker-sandboxed code execution
- `src/lib/realtime/realtime-coordination.ts` — SSE coordination
- `src/app/api/v1/submissions/[id]/events/route.ts` — SSE events route
- `src/app/api/v1/submissions/route.ts` — Submissions API
- `src/app/api/v1/playground/run/route.ts` — Playground execution
- `src/app/api/v1/tags/route.ts` — Tags API
- `src/app/api/v1/users/route.ts` — Users API
- `src/app/api/metrics/route.ts` — Metrics endpoint
- `src/app/api/internal/cleanup/route.ts` — Cleanup cron
- `src/proxy.ts` — Edge middleware
- `src/components/layout/public-header.tsx` — Top navigation
- `src/components/layout/app-sidebar.tsx` — Dashboard sidebar
- `src/lib/plugins/secrets.ts` — Plugin secret encryption

## Findings

### CR10-CR1 — [MEDIUM] Auth config still has 4 separate field lists despite `mapUserToAuthFields` extraction

- **Confidence:** HIGH
- **File:** `src/lib/auth/config.ts:58-78, 280-296, 368-386, 438-456`
- **Evidence:** While `mapUserToAuthFields` was extracted (commit 71df1c30), the `authorize()` function (line 280-296), the `jwt` callback's `if (user)` branch (line 368-386), and the `jwt` callback's `freshUser` branch (line 438-456) still manually construct `AuthUserRecord` objects with hardcoded field lists. Adding a new preference field requires changes in all four places plus `mapUserToAuthFields`. The `authorize()` and `jwt` callback branches should also use `mapUserToAuthFields` to construct the `AuthUserRecord` passed to `syncTokenWithUser`.
- **Failure scenario:** A developer adds a new preference field `preferredEditorLayout` to `mapUserToAuthFields` and `AuthUserRecord` but forgets to add it to the `authorize()` function's inline object (line 280-296). The field would be `undefined` on login, falling back to the `??` default in `mapUserToAuthFields`, but the `jwt` callback's DB query `columns` list (line 407-427) would also need the new column. A missed column in the DB query would silently drop the field from the token on refresh.
- **Suggested fix:** Refactor `authorize()` and `jwt` callbacks to construct `AuthUserRecord` using a single source of truth. The DB query `columns` list should be derived from `AuthUserRecord` keys, or at minimum a shared constant array should define the columns to select.

### CR10-CR2 — [MEDIUM] `clearAuthToken` must stay in sync with `mapUserToAuthFields` — no compile-time enforcement

- **Confidence:** HIGH
- **File:** `src/lib/auth/session-security.ts:37-60`
- **Evidence:** `clearAuthToken` deletes 17 specific token fields by name. If a new field is added to `mapUserToAuthFields` but not to `clearAuthToken`, the field would persist in the JWT after logout/token-clearing, potentially allowing stale data to survive a session reset. There is no compile-time check that the set of fields in `clearAuthToken` matches the set in `mapUserToAuthFields` or `mapTokenToSession`.
- **Failure scenario:** A new `preferredEditorLayout` field is added to `mapUserToAuthFields` and `mapTokenToSession` but not to `clearAuthToken`. After an admin forces a password reset (`tokenInvalidatedAt` is set), the `jwt` callback calls `clearAuthToken`, but `preferredEditorLayout` survives. On the next request, the `jwt` callback re-queries the DB and syncs the token — so the stale value is overwritten. However, if the `jwt` callback is skipped (e.g., the token is used directly by a different mechanism), the stale value persists. Low probability, but the maintenance hazard is real.
- **Suggested fix:** Derive the field list for `clearAuthToken` from the same source as `mapUserToAuthFields`. For example, maintain a `const AUTH_TOKEN_FIELDS` array and iterate it in both places.

### CR10-CR3 — [MEDIUM] `authUserSelect` in `selects.ts` does not include user preference fields — proxy auth check loses preferences

- **Confidence:** HIGH
- **File:** `src/lib/db/selects.ts:3-13`, `src/proxy.ts:244-255`, `src/lib/api/auth.ts:28-58`
- **Evidence:** `authUserSelect` only includes `id, role, username, email, name, className, isActive, mustChangePassword, tokenInvalidatedAt`. It does NOT include `preferredLanguage, preferredTheme, shareAcceptedSolutions, acceptedSolutionsAnonymous, editorTheme, editorFontSize, editorFontFamily, lectureMode, lectureFontScale, lectureColorScheme`. The `getActiveAuthUserById` function (used by `getApiUser` and the proxy middleware) uses `authUserSelect`, so it returns a minimal user object without preferences. This is fine for auth checking, but if any code path uses `getApiUser` and then reads preference fields from the result, those fields would be `undefined`.
- **Failure scenario:** Currently no code path reads preferences from the API auth user — they're always read from the JWT/session token. But a future developer might assume `getApiUser` returns all user fields and read `user.preferredLanguage` directly, getting `undefined`. This is a latent risk, not an active bug.
- **Suggested fix:** Add a comment to `authUserSelect` and `getActiveAuthUserById` JSDoc noting that preference fields are intentionally excluded because they're carried by the JWT token, not the API auth context.

### CR10-CR4 — [LOW] `recordRateLimitFailure` uses `consecutiveBlocks` as the exponent base, but `consumeRateLimitAttemptMulti` uses `consecutiveBlocks - 1`

- **Confidence:** HIGH
- **File:** `src/lib/security/rate-limit.ts:204, 166`
- **Evidence:** In `consumeRateLimitAttemptMulti` (line 166): `const blockMs = calculateBlockDuration(consecutiveBlocks - 1, cfg.blockMs)`. In `recordRateLimitFailure` (line 204): `const blockDuration = calculateBlockDuration(consecutiveBlocks, cfg.blockMs)`. The `recordRateLimitFailure` function increments `consecutiveBlocks` AFTER calculating the block duration (line 207: `consecutiveBlocks += 1`), while `consumeRateLimitAttemptMulti` increments BEFORE the calculation. This means `recordRateLimitFailure` calculates the block duration with the pre-increment value but names the variable as if it's post-increment. The result is the same (both end up with the same effective exponent), but the code is confusing.
- **Failure scenario:** A developer reading `recordRateLimitFailure` assumes `consecutiveBlocks` has already been incremented (matching the variable name semantics) and adjusts the exponent calculation, inadvertently changing the backoff behavior.
- **Suggested fix:** Rename the local variable in `recordRateLimitFailure` to make the ordering clear, or restructure to match the pattern in `consumeRateLimitAttemptMulti`.

### CR10-CR5 — [LOW] `localStorage.clear()` and `sessionStorage.clear()` in sign-out may clear data from other apps on the same origin

- **Confidence:** MEDIUM
- **File:** `src/components/layout/app-sidebar.tsx:240-241`
- **Evidence:** The `handleSignOut` function calls `localStorage.clear()` and `sessionStorage.clear()` before `signOut()`. This clears ALL storage for the origin, not just the app's own keys. If the app shares an origin with other applications (unlikely in production but possible in dev with port-sharing), this would destroy their state.
- **Failure scenario:** In a development environment where multiple apps share localhost:3000, signing out of one app clears all localStorage for the other app, causing data loss.
- **Suggested fix:** Instead of `localStorage.clear()`, iterate and remove only keys with the app's prefix (e.g., `judgekit-*`), or use a namespace approach.

### CR10-CR6 — [LOW] SSE cleanup timer does not clean up the `activeConnectionSet` — stale entries accumulate

- **Confidence:** MEDIUM
- **File:** `src/app/api/v1/submissions/[id]/events/route.ts:81-94`
- **Evidence:** The periodic cleanup timer (line 81-94) iterates `connectionInfoMap` and removes stale entries via `removeConnection`. However, `removeConnection` also deletes from `activeConnectionSet`. This is correct. But the stale threshold is `min(sseTimeoutMs + 30_000, 2 * 60 * 60 * 1000)`. If a connection was added to `activeConnectionSet` but NOT to `connectionInfoMap` (which shouldn't happen given current code), it would never be cleaned up. More importantly, the cleanup timer is a `setInterval` that runs even when there are no connections — it should check if `connectionInfoMap.size === 0` and skip the iteration.
- **Suggested fix:** Add an early return in the cleanup callback when `connectionInfoMap.size === 0`.

## Previously Found Issues (Still Open)

- D3: JWT callback DB query on every request — MEDIUM (still present, no TTL cache)
- D4: Test coverage gaps for workspace-to-public migration Phase 2 — MEDIUM
- D5: Backup/restore/migrate routes use manual auth pattern — LOW
- D6: Files/[id] DELETE/PATCH manual auth — LOW
- D7: SSE re-auth rate limiting — LOW
- D8: PublicHeader click-outside-to-close — LOW
- D9: `namedToPositional` regex alignment — LOW

## Previously Found Issues (Verified Fixed Since Cycle 9)

- CR9-CR1: Triple auth field mapping — PARTIALLY FIXED (`mapUserToAuthFields` extracted, but 4 separate field lists remain — see CR10-CR1)
- CR9-CR2: SSE re-auth race — FIXED (commit 908b12a1, now awaits re-auth check)
- CR9-CR3: Export duplicate table names — LOW, still present
- CR9-CR4: Playground stdin length — FIXED (commit 1ca7a88c, MAX_STDIN_LENGTH = 64 * 1024 - 1)
- CR9-CR5: SSE LIKE pattern — LOW, still present
- CR9-CR6: shareAcceptedSolutions defaults — PART OF CR10-CR1
- CR9-DB1: SSE eviction by insertion — FIXED (commit 832f9902, now evicts by age)
- CR9-V3: BigInt in normalizeValue — FIXED (commit 434b94ba)
- CR9-V4: MySQL in validDialects — LOW, still present
