# Cycle 10 Verifier Report

**Reviewer:** verifier
**Date:** 2026-04-19
**Base commit:** 56e78d62
**Scope:** Evidence-based correctness check against stated behavior

## Verification Method

For each claim made by the codebase (comments, docs, API contracts), verify that the implementation matches. Check edge cases and invariant violations.

## Findings

### CR10-V1 — [MEDIUM] `clearAuthToken` does not set `authenticatedAt` to 0 — fallback to `iat` could bypass revocation

- **Confidence:** MEDIUM
- **Cross-agent agreement:** security-reviewer CR10-SR1, debugger CR10-DB1
- **File:** `src/lib/auth/session-security.ts:37-60`
- **Evidence:** `clearAuthToken` deletes `authenticatedAt` from the token (line 56). `getTokenAuthenticatedAtSeconds` then falls back to `token.iat`. The stated behavior of `clearAuthToken` is to "clear the auth token" — meaning the token should be invalid for all subsequent requests. But the fallback to `iat` creates a window where the token might not be detected as invalidated (if `iat > tokenInvalidatedAt`).
- **Stated behavior:** Clearing the token should make it unconditionally invalid.
- **Actual behavior:** Clearing the token deletes `authenticatedAt`, causing a fallback to `iat`. If `iat > tokenInvalidatedAt`, `isTokenInvalidated` returns `false`, and the token is NOT cleared on the next refresh.
- **Suggested fix:** Set `token.authenticatedAt = 0` instead of deleting it. This makes `isTokenInvalidated(0, tokenInvalidatedAt)` always return `true` when `tokenInvalidatedAt` is set.

### CR10-V2 — [MEDIUM] DB query `columns` list in jwt callback does not include all fields from `AuthUserRecord`

- **Confidence:** HIGH
- **File:** `src/lib/auth/config.ts:407-427`
- **Evidence:** The `jwt` callback's DB query (line 405-428) explicitly lists columns to select. This list must match the fields expected by `syncTokenWithUser`. Currently it includes: `id, username, email, name, className, role, isActive, mustChangePassword, tokenInvalidatedAt, preferredLanguage, preferredTheme, shareAcceptedSolutions, acceptedSolutionsAnonymous, editorTheme, editorFontSize, editorFontFamily, lectureMode, lectureFontScale, lectureColorScheme`. This matches the fields in `mapUserToAuthFields`. However, there is no compile-time enforcement that the column list matches the `AuthUserRecord` type. If a new field is added to `AuthUserRecord` but not to the column list, the field would be `undefined` in the query result, causing `mapUserToAuthFields` to use the `??` default instead of the actual DB value.
- **Stated behavior:** The jwt callback refreshes the token with the latest user data from the DB.
- **Failure scenario:** A developer adds `preferredEditorLayout: text("preferred_editor_layout")` to the schema, adds it to `AuthUserRecord` and `mapUserToAuthFields`, but forgets to add `preferredEditorLayout: true` to the `columns` list. The jwt callback would set `preferredEditorLayout` to the `??` default (null) instead of the actual DB value. Users who set this preference would lose it on every JWT refresh.
- **Suggested fix:** Derive the `columns` list from a shared constant or type, so adding a field to `AuthUserRecord` automatically includes it in the query.

### CR10-V3 — [LOW] `validateExport` still accepts `"mysql"` as a valid `sourceDialect`

- **Confidence:** LOW
- **Cross-agent agreement:** cycle-9 verifier CR9-V4
- **File:** `src/lib/db/export.ts:287`
- **Evidence:** Line 287 validates `sourceDialect` against `["sqlite", "postgresql"]`. Wait — this was FIXED! The current code shows `["sqlite", "postgresql"]` without `"mysql"`. Let me verify... Actually, looking at the current code: `if (!exp.sourceDialect || !["sqlite", "postgresql"].includes(exp.sourceDialect as string))`. This is correct — `mysql` was removed. This finding is now FIXED.
- **Verdict:** Previously reported as an issue. Now VERIFIED FIXED.

### CR10-V4 — [LOW] `authorize()` function constructs AuthUserRecord without `acceptedSolutionsAnonymous` field if DB value is null

- **Confidence:** LOW
- **File:** `src/lib/auth/config.ts:280-296`
- **Evidence:** In the `authorize()` function (line 280-296), the `AuthUserRecord` object is constructed with `shareAcceptedSolutions: user.shareAcceptedSolutions ?? true` (line 289) and `acceptedSolutionsAnonymous: user.acceptedSolutionsAnonymous ?? false` (line 290... actually checking). Wait — the `authorize()` function at line 280-296 does NOT include `acceptedSolutionsAnonymous`. Let me re-check... Looking at lines 279-311: `shareAcceptedSolutions` is present (line 289) but `acceptedSolutionsAnonymous` is NOT in the inline object. However, `mapUserToAuthFields` does include it. Since `authorize()` passes the inline object to `createSuccessfulLoginResponse` which spreads `mapUserToAuthFields`, the `acceptedSolutionsAnonymous` field would come from `mapUserToAuthFields(user)` where `user` is the inline object. But the inline object doesn't have `acceptedSolutionsAnonymous`, so `user.acceptedSolutionsAnonymous` would be `undefined`, and `mapUserToAuthFields` would use `?? false`. This is correct behavior — the DB value is lost and replaced by the default. But it means the DB value is ignored on login.
- **Verdict:** CONFIRMED BUG (LOW). The `authorize()` function's inline AuthUserRecord is missing `acceptedSolutionsAnonymous`, so the DB value is always ignored on login and replaced by the default `false`.
- **Suggested fix:** Add `acceptedSolutionsAnonymous: user.acceptedSolutionsAnonymous ?? false` to the `authorize()` function's inline object. Or better, refactor to use `mapUserToAuthFields`.

## Previously Verified Fixes

- CR9-V2: SSE eviction by insertion — VERIFIED FIXED (oldest-by-age eviction)
- CR9-V3: BigInt in normalizeValue — VERIFIED FIXED (`val.toString()`)
- CR9-V4: MySQL in validDialects — VERIFIED FIXED (`["sqlite", "postgresql"]` only)
