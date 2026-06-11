# Cycle 13 Debugger Report

**Date:** 2026-04-19
**Base commit:** e8340da5
**Reviewer angle:** Latent bug surface, failure modes, regressions

---

## CR13-DB1 — [MEDIUM] `syncTokenWithUser` manual field assignments will silently miss new preference fields

- **File:** `src/lib/auth/config.ts:119-137`
- **Confidence:** HIGH
- **Evidence:** `syncTokenWithUser` manually assigns `token.preferredLanguage = fields.preferredLanguage`, `token.shareAcceptedSolutions = fields.shareAcceptedSolutions`, etc. for every field returned by `mapUserToAuthFields`. If a developer adds a new preference field to `AUTH_PREFERENCE_FIELDS` and `mapUserToAuthFields`, they must ALSO add it to `syncTokenWithUser`. If they forget, the JWT token will silently miss the field, and the session will use the default value instead of the user's actual preference. This is the exact same class of bug that caused the `shareAcceptedSolutions` issue in cycle 10.
- **Failure scenario:** A new field `preferredFontSize` is added to `AUTH_PREFERENCE_FIELDS`, `AuthUserRecord`, and `mapUserToAuthFields`. Developer forgets to add `token.preferredFontSize = fields.preferredFontSize` in `syncTokenWithUser`. After login, the token does not contain `preferredFontSize`, so the session uses the default. User changes their font size preference but it never takes effect until the next full page reload.
- **Suggested fix:** Replace manual assignments with `Object.assign(token, fields)` (preserving `token.authenticatedAt` separately). This makes the function automatically pick up any new field added to `mapUserToAuthFields`.

## CR13-DB2 — [LOW] `mapTokenToSession` has the same manual field assignment issue as `syncTokenWithUser`

- **File:** `src/lib/auth/config.ts:147-168`
- **Confidence:** MEDIUM
- **Evidence:** `mapTokenToSession` manually assigns `session.user.preferredLanguage = token.preferredLanguage ?? null`, etc. for every preference field. Same class of bug as DB1 — if a new field is added to the JWT token but not to `mapTokenToSession`, the session object will miss it.
- **Suggested fix:** Same as DB1 — use `Object.assign` or iterate over `AUTH_PREFERENCE_FIELDS`.

## CR13-DB3 — [LOW] `handleSignOut` in `AppSidebar` uses `void` to fire-and-forget an async function

- **File:** `src/components/layout/app-sidebar.tsx:325`
- **Confidence:** LOW
- **Evidence:** `void handleSignOut()` means any unhandled rejection from `signOut` will become an unhandled promise rejection. The `signOut` from `next-auth/react` is generally well-behaved, but if network conditions cause it to throw, the error is silently swallowed.
- **Suggested fix:** Add a `.catch()` handler or use try/catch inside `handleSignOut`.

---

## Final Sweep

- The cycle 12 fixes (recruiting token refactoring, mustChangePassword, blockedUntil normalization, SSE early guard) are all verified and working correctly.
- No new race conditions or failure modes introduced by the cycle 12 changes.
- The `syncTokenWithUser` manual field assignment pattern is the most significant latent bug risk in the codebase.
