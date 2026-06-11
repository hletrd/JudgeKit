# Cycle 11 Tracer Report

**Reviewer:** tracer
**Date:** 2026-04-19
**Base commit:** 6c99b15c
**Scope:** Causal tracing of suspicious flows, competing hypotheses

## Traced Flows

### Flow 1: authorize() -> createSuccessfulLoginResponse -> mapUserToAuthFields — Inline Object Incompleteness

**Hypothesis:** The `authorize()` function constructs an inline `AuthUserRecord` that may be missing fields, causing DB values to be lost on login.

**Trace:**
1. User submits credentials -> `authorize()` runs
2. DB query returns `user` object with all columns (no `columns` filter)
3. `authorize()` constructs inline object: `{ id, username, email, name, className, role, mustChangePassword, preferredLanguage, preferredTheme, shareAcceptedSolutions, acceptedSolutionsAnonymous, editorTheme, editorFontSize, editorFontFamily, lectureMode, lectureFontScale, lectureColorScheme }` (line 318-336)
4. `createSuccessfulLoginResponse(user, ...)` is called with this object
5. `createSuccessfulLoginResponse` calls `mapUserToAuthFields(user)` where `user` is the inline object
6. All fields currently present in the inline object are correctly passed through
7. IF a new field is added to `mapUserToAuthFields` but not to the inline object, `user.newField` would be `undefined`
8. The `??` default applies -> the DB value is silently lost

**Competing hypothesis:** The `authorize()` DB query fetches ALL columns, so the DB `user` object has all fields. The inline object is redundant — the same data is available directly.

**Verdict:** Hypothesis PARTIALLY CONFIRMED. Currently all fields are present, so no bug exists now. But the pattern is fragile — the `acceptedSolutionsAnonymous` bug was caused by exactly this pattern. Passing the DB `user` directly to `createSuccessfulLoginResponse` would eliminate the risk entirely.

### Flow 2: JWT callback freshUser -> syncTokenWithUser — Inline Object vs DB Query Result

**Hypothesis:** The `jwt` callback's `freshUser` branch constructs an inline `AuthUserRecord` from the DB query result, which is redundant because the DB query already uses `AUTH_USER_COLUMNS`.

**Trace:**
1. `jwt` callback runs on each request
2. DB query: `db.query.users.findFirst({ where: eq(users.id, userId), columns: AUTH_USER_COLUMNS })` (line 449-452)
3. `AUTH_USER_COLUMNS` includes all preference fields (derived from `AUTH_PREFERENCE_FIELDS`)
4. `freshUser` is the query result — it has all the fields
5. Code constructs inline object: `{ id: freshUser.id, username: freshUser.username, ... }` (line 462-480)
6. This inline object is passed to `syncTokenWithUser`
7. The inline object is a manual copy of fields already available in `freshUser`

**Competing hypothesis:** The inline object provides explicit control over which fields are passed and allows applying `??` defaults. This is a design choice, not a bug.

**Verdict:** Hypothesis CONFIRMED. The inline object is redundant. The DB query result `freshUser` already has all fields from `AUTH_USER_COLUMNS`. Passing `freshUser` directly to `syncTokenWithUser` (or to `mapUserToAuthFields` via `syncTokenWithUser`) would be simpler and eliminate the sync risk.
