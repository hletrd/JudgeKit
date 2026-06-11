# Cycle 11 Verifier Report

**Reviewer:** verifier
**Date:** 2026-04-19
**Base commit:** 6c99b15c
**Scope:** Evidence-based correctness check against stated behavior

## Verification Method

For each claim made by the codebase (comments, docs, API contracts), verify that the implementation matches. Check edge cases and invariant violations.

## Findings

### CR11-V1 — [MEDIUM] `authorize()` inline AuthUserRecord passes incomplete data to mapUserToAuthFields — DB values lost on login for any future field

- **Confidence:** HIGH
- **Cross-agent agreement:** code-reviewer CR11-CR1, debugger CR11-DB2, architect CR11-AR3
- **File:** `src/lib/auth/config.ts:317-336`
- **Evidence:** The `authorize()` function (line 317-336) constructs an inline `AuthUserRecord` object and passes it to `createSuccessfulLoginResponse`. The `createSuccessfulLoginResponse` function calls `mapUserToAuthFields(user)` where `user` is the inline object. The comment on `mapUserToAuthFields` says "Add new preference fields to AUTH_PREFERENCE_FIELDS and HERE" — but the `authorize()` inline object is also HERE. If a new field is added to `mapUserToAuthFields` but not to the inline object, the field's DB value is lost on login.
- **Stated behavior:** The `authorize()` function should return a user object with all auth-relevant fields from the DB.
- **Actual behavior:** The `authorize()` function constructs an inline object that must be manually kept in sync with `mapUserToAuthFields`. If a field is missed, the DB value is silently replaced by the default.
- **Suggested fix:** Pass the DB `user` object directly to `createSuccessfulLoginResponse`. The DB query in `authorize()` uses no `columns` filter, so all columns are available.

### CR11-V2 — [MEDIUM] `jwt` callback `freshUser` branch constructs AuthUserRecord inline even though the DB query already uses AUTH_USER_COLUMNS

- **Confidence:** HIGH
- **File:** `src/lib/auth/config.ts:462-480`
- **Evidence:** The `jwt` callback's `freshUser` branch (line 462-480) constructs an inline `AuthUserRecord` from `freshUser`, even though the DB query already uses `AUTH_USER_COLUMNS` (line 451) which includes all preference fields. The inline object must be manually kept in sync with `AUTH_USER_COLUMNS`. If a new field is added to `AUTH_PREFERENCE_FIELDS` (and thus `AUTH_USER_COLUMNS`), it will be in the DB query result but may be missed in the inline object.
- **Stated behavior:** The jwt callback refreshes the token with the latest user data from the DB.
- **Actual behavior:** The inline object must be manually updated for each new field. The DB query result already has all fields.
- **Suggested fix:** Pass `freshUser` directly to `syncTokenWithUser` (or to `mapUserToAuthFields` via `syncTokenWithUser`). The DB query result already has all the necessary fields.

### CR11-V3 — [LOW] `isTokenInvalidated` returns `false` when both `authenticatedAtSeconds` and `tokenInvalidatedAt` are 0

- **Confidence:** MEDIUM
- **File:** `src/lib/auth/session-security.ts:25-35`
- **Evidence:** `isTokenInvalidated(0, new Date(0))` would compute `invalidatedAtSeconds = 0` and return `0 < 0` which is `false`. This means a token with `authenticatedAt = 0` (set by `clearAuthToken`) would NOT be invalidated if `tokenInvalidatedAt` is exactly Unix epoch (Date(0)). In practice, `tokenInvalidatedAt` is never Date(0), so this is a theoretical edge case.
- **Verdict:** NOT A BUG in practice. `tokenInvalidatedAt` is set by the DB and is always a real timestamp. The `authenticatedAt = 0` value from `clearAuthToken` will always be less than `tokenInvalidatedAt` in any realistic scenario.
