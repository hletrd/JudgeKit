# Cycle 10 Tracer Report

**Reviewer:** tracer
**Date:** 2026-04-19
**Base commit:** 56e78d62
**Scope:** Causal tracing of suspicious flows, competing hypotheses

## Traced Flows

### Flow 1: Token Revocation -> clearAuthToken -> iat Fallback

**Hypothesis:** Clearing the auth token via `clearAuthToken` creates a window where token revocation can be bypassed due to the `iat` fallback.

**Trace:**
1. Admin forces password reset -> `tokenInvalidatedAt` updated in DB
2. User's next request -> `jwt` callback runs
3. `getTokenUserId(token)` returns user ID -> proceeds
4. DB query fetches `freshUser` with `tokenInvalidatedAt`
5. `isTokenInvalidated(authenticatedAt, freshUser.tokenInvalidatedAt)` -> true (authenticatedAt < tokenInvalidatedAt)
6. `clearAuthToken(token)` is called -> deletes `authenticatedAt`, `id`, `role`, etc.
7. Token is returned with all auth fields deleted
8. NextAuth processes the returned token -> session is invalidated
9. On the SAME request (if NextAuth re-invokes `jwt`), `getTokenAuthenticatedAtSeconds(token)` falls back to `token.iat`
10. If `token.iat > tokenInvalidatedAt` (possible if user re-authenticated after the first invalidation but before the second), `isTokenInvalidated` returns `false`
11. `syncTokenWithUser` runs with the fresh DB user -> token is restored!

**Competing hypothesis:** NextAuth does not re-invoke `jwt` on the same request. The cleared token is returned directly and the session is ended. The `iat` fallback is only relevant if some other code path reads the token between `clearAuthToken` and the session ending.

**Verdict:** Hypothesis PARTIALLY CONFIRMED. The theoretical risk exists if NextAuth re-invokes `jwt`, but this is unlikely in practice. Setting `authenticatedAt = 0` instead of deleting it would eliminate the risk entirely.

### Flow 2: authorize() -> createSuccessfulLoginResponse -> mapUserToAuthFields — Missing Field

**Hypothesis:** The `authorize()` function constructs an `AuthUserRecord` that is missing `acceptedSolutionsAnonymous`, causing the DB value to be lost on login.

**Trace:**
1. User submits credentials -> `authorize()` runs
2. DB query returns `user` object with all columns
3. `authorize()` constructs inline object: `{ id, username, email, name, className, role, mustChangePassword, preferredLanguage, preferredTheme, shareAcceptedSolutions, editorTheme, editorFontSize, editorFontFamily, lectureMode, lectureFontScale, lectureColorScheme }` (line 280-296)
4. Note: `acceptedSolutionsAnonymous` is MISSING from this object
5. `createSuccessfulLoginResponse(user, ...)` is called with this object
6. `createSuccessfulLoginResponse` calls `mapUserToAuthFields(user)` where `user` is the inline object
7. `mapUserToAuthFields` reads `user.acceptedSolutionsAnonymous` which is `undefined` (not in the inline object)
8. `?? false` default applies -> `acceptedSolutionsAnonymous` is `false` regardless of the DB value
9. The user's actual preference from the DB is lost

**Verdict:** Hypothesis CONFIRMED. The `authorize()` function's inline `AuthUserRecord` is missing `acceptedSolutionsAnonymous`, so the DB value is always replaced by `false` on login.

### Flow 3: PublicHeader vs AppSidebar — Capability Check Divergence

**Hypothesis:** A custom role with specific capabilities would see different navigation items in the public header dropdown vs the dashboard sidebar.

**Trace:**
1. Custom role "teaching_assistant" is created with capabilities: `problems.create`, `submissions.view_all`
2. User with this role logs in -> `getDropdownItems("teaching_assistant")` runs
3. `isInstructor = "teaching_assistant" === "instructor" || ...` -> false
4. `isAdmin = "teaching_assistant" === "admin" || ...` -> false
5. Dropdown items: Dashboard, My Submissions, Profile (no Problems, no Groups, no Admin)
6. User navigates to dashboard -> `AppSidebar` renders with `capabilities = ["problems.create", "submissions.view_all"]`
7. `filterItems` checks `capsSet.has("problems.create")` -> true -> "Problems" item is shown
8. Navigation items: Dashboard, Problems, Submissions, Profile (has Problems, different from header)

**Verdict:** Hypothesis CONFIRMED. Custom roles will see different navigation items in the public header vs the dashboard sidebar.
