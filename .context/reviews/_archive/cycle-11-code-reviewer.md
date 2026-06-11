# Cycle 11 Code Reviewer Report

**Reviewer:** code-reviewer
**Date:** 2026-04-19
**Base commit:** 6c99b15c
**Scope:** Full codebase review focusing on code quality, logic, SOLID, maintainability

## Inventory of Files Reviewed

- `src/lib/auth/config.ts` — NextAuth configuration, field mapping, AUTH_PREFERENCE_FIELDS
- `src/lib/auth/session-security.ts` — Token clearing/invalidation, AUTH_TOKEN_FIELDS
- `src/lib/auth/types.ts` — AuthUserRecord type
- `src/lib/auth/permissions.ts` — Access control functions
- `src/lib/api/handler.ts` — API handler factory
- `src/lib/api/auth.ts` — API auth helpers
- `src/lib/db/export.ts` — Database export engine
- `src/lib/db/import.ts` — Database import engine
- `src/lib/db/selects.ts` — Query column selects
- `src/lib/security/encryption.ts` — AES-256-GCM encryption
- `src/lib/security/rate-limit.ts` — Login rate limiting
- `src/lib/security/api-rate-limit.ts` — API rate limiting
- `src/lib/compiler/execute.ts` — Docker-sandboxed code execution
- `src/lib/realtime/realtime-coordination.ts` — SSE coordination
- `src/app/api/v1/submissions/[id]/events/route.ts` — SSE events route
- `src/app/api/v1/tags/route.ts` — Tags API
- `src/app/api/metrics/route.ts` — Metrics endpoint
- `src/app/api/internal/cleanup/route.ts` — Cleanup cron
- `src/proxy.ts` — Edge middleware
- `src/components/layout/public-header.tsx` — Top navigation
- `src/components/layout/app-sidebar.tsx` — Dashboard sidebar

## Findings

### CR11-CR1 — [MEDIUM] `authorize()` and `jwt` callback `if (user)` branch still construct AuthUserRecord inline instead of using mapUserToAuthFields

- **Confidence:** HIGH
- **File:** `src/lib/auth/config.ts:317-336, 408-430`
- **Evidence:** The cycle 10 remediation added `AUTH_PREFERENCE_FIELDS`, `AUTH_CORE_FIELDS`, and `AUTH_USER_COLUMNS` constants, and refactored `clearAuthToken` to iterate `AUTH_TOKEN_FIELDS`. However, the `authorize()` function (line 317-336) and the `jwt` callback's `if (user)` branch (line 408-430) still construct `AuthUserRecord` objects with hardcoded field lists. Adding a new preference field now requires updating: (1) `AUTH_PREFERENCE_FIELDS`, (2) `mapUserToAuthFields`, (3) `authorize()` inline object, (4) `jwt` callback `if (user)` branch inline object, (5) `jwt` callback `freshUser` branch inline object. The `authorize()` function passes the inline object to `createSuccessfulLoginResponse` which spreads `mapUserToAuthFields(user)` — but the inline object IS the user passed to `mapUserToAuthFields`, so any missing field falls back to the `??` default, which is correct but means the DB value is lost if the field is omitted from the inline object.
- **Failure scenario:** A developer adds `preferredEditorLayout` to `AUTH_PREFERENCE_FIELDS` and `mapUserToAuthFields` but forgets to add it to the `authorize()` inline object. The DB value is silently replaced by the `??` default on login. No compile-time error.
- **Suggested fix:** Refactor `authorize()` and the `jwt` callback `if (user)` branch to pass the DB user object directly to `mapUserToAuthFields` instead of constructing an intermediate inline object. The DB query in `authorize()` already fetches all columns (no `columns` filter), so `user` already has all fields.

### CR11-CR2 — [MEDIUM] `AUTH_TOKEN_FIELDS` in session-security.ts and `AUTH_PREFERENCE_FIELDS` in config.ts are maintained independently — no compile-time enforcement of sync

- **Confidence:** HIGH
- **File:** `src/lib/auth/session-security.ts:42-63`, `src/lib/auth/config.ts:58-69`
- **Evidence:** `AUTH_TOKEN_FIELDS` (session-security.ts) lists 21 fields including `sub`, `authenticatedAt`, and `uaHash` (token-specific fields). `AUTH_PREFERENCE_FIELDS` (config.ts) lists 10 preference fields. These two arrays must stay in sync when a new preference field is added: the field must be added to both `AUTH_PREFERENCE_FIELDS` and `AUTH_TOKEN_FIELDS`. There is no compile-time check ensuring that every preference field in `AUTH_PREFERENCE_FIELDS` is also in `AUTH_TOKEN_FIELDS`. If a new field is added to `AUTH_PREFERENCE_FIELDS` but not `AUTH_TOKEN_FIELDS`, `clearAuthToken` would not clear it, leaving stale data in the JWT after token revocation.
- **Failure scenario:** Developer adds `preferredEditorLayout` to `AUTH_PREFERENCE_FIELDS` and `mapUserToAuthFields` but forgets to add it to `AUTH_TOKEN_FIELDS`. After token revocation, `preferredEditorLayout` survives in the JWT. No test or compile-time check catches the omission.
- **Suggested fix:** Import `AUTH_PREFERENCE_FIELDS` into session-security.ts and derive the preference portion of `AUTH_TOKEN_FIELDS` from it. Add a unit test that verifies all fields set by `syncTokenWithUser` are covered by `AUTH_TOKEN_FIELDS`.

### CR11-CR3 — [LOW] SSE `onPollResult` callback has duplicated terminal-result-fetch logic in two code paths

- **Confidence:** HIGH
- **File:** `src/app/api/v1/submissions/[id]/events/route.ts:346-366, 389-410`
- **Evidence:** The re-auth path (lines 346-366) and the non-re-auth path (lines 389-410) both fetch the full submission and send a result event with nearly identical logic. The only difference is that the re-auth path is inside an async IIFE and the non-re-auth path starts its own async IIFE. If a bug is fixed in one path, it must be applied in the other.
- **Failure scenario:** A developer adds error handling for `sanitizeSubmissionForViewer` in the re-auth path but forgets to add it to the non-re-auth path. The non-re-auth path could crash on unexpected data while the re-auth path handles it gracefully.
- **Suggested fix:** Extract the terminal-result-fetch logic into a shared helper function (e.g., `sendTerminalResult`) that both paths call.

### CR11-CR4 — [LOW] `authUserSelect` in selects.ts does not include preference fields — latent risk for code that reads preferences from API auth context

- **Confidence:** HIGH
- **File:** `src/lib/db/selects.ts:3-13`, `src/lib/api/auth.ts:28-58`
- **Evidence:** `authUserSelect` only includes core auth fields (`id, role, username, email, name, className, isActive, mustChangePassword, tokenInvalidatedAt`). It does NOT include preference fields. The `getActiveAuthUserById` function (used by `getApiUser` and the proxy middleware) uses `authUserSelect`, so it returns a minimal user object without preferences. Currently no code path reads preferences from the API auth user — they're always read from the JWT/session token. But a future developer might assume `getApiUser` returns all user fields.
- **Failure scenario:** A developer adds `const lang = user.preferredLanguage` in an API route handler using `getApiUser`, getting `undefined` instead of the user's language preference.
- **Suggested fix:** Add a JSDoc comment to `authUserSelect` and `getActiveAuthUserById` noting that preference fields are intentionally excluded because they're carried by the JWT token.

## Previously Found Issues (Still Open)

- D3: JWT callback DB query on every request — MEDIUM (still present, no TTL cache)
- D4: Test coverage gaps for workspace-to-public migration — MEDIUM
- D5: Backup/restore/migrate routes use manual auth pattern — LOW
- D6: Files/[id] DELETE/PATCH manual auth — LOW
- D7: SSE re-auth rate limiting — LOW
- D8: PublicHeader click-outside-to-close — LOW
- D9: `namedToPositional` regex alignment — LOW

## Previously Found Issues (Verified Fixed Since Cycle 10)

- AGG-2 (CR10-SR1): `clearAuthToken` fallback to `iat` — FIXED (now sets `authenticatedAt = 0`)
- AGG-3 (CR10-V4): `authorize()` missing `shareAcceptedSolutions`/`acceptedSolutionsAnonymous` — FIXED (commit 639e30b2)
- AGG-4 (CR10-CT2): PublicHeader uses hardcoded role checks — FIXED (commit 3a2b56d7, now capability-based)
- AGG-7 (CR10-SR3): Tags route lacks rate limiting — FIXED (commit daf25688, now has `rateLimit: "tags:read"`)
- AGG-8 (CR10-SR4): Shell command denylist missing `exec`/`source` — FIXED (commit cc31fbae)
- AGG-10 (CR10-CR4): `recordRateLimitFailure` backoff exponent inconsistency — FIXED (commit a8b80864)
- AGG-11 (CR10-D2/D3): Korean letter spacing violations — FIXED (commit 79204982)
- AGG-1 partially: `AUTH_PREFERENCE_FIELDS` / `AUTH_USER_COLUMNS` / `AUTH_TOKEN_FIELDS` constants added, `clearAuthToken` refactored (commits 639e30b2, 8ecb7d1c)
