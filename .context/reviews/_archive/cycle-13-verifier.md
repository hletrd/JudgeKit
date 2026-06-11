# Cycle 13 Verifier Report

**Date:** 2026-04-19
**Base commit:** e8340da5
**Reviewer angle:** Evidence-based correctness check against stated behavior

---

## CR13-V1 — [MEDIUM] Public layout and dashboard layout may render different navigation labels for the same items

- **File:** `src/app/(public)/layout.tsx:29-35` vs `src/app/(dashboard)/layout.tsx:74-81`
- **Confidence:** HIGH
- **Evidence:** The public layout passes labels from `tShell("nav.practice")` etc. (using the `publicShell` namespace), while the dashboard layout passes labels from `t("practice")` etc. (using the `common` namespace). If the i18n keys map to different translated strings, users will see different labels for the same navigation items when navigating between public and dashboard pages. This is a correctness issue — the same navigation item should have the same label everywhere.
- **Verification needed:** Check that `publicShell.nav.practice` and `common.practice` resolve to the same string in all locales.
- **Suggested fix:** Use a single i18n namespace for navigation labels, or extract a shared helper.

## CR13-V2 — [LOW] `mapUserToAuthFields` return type is not asserted to match `AuthUserRecord`

- **File:** `src/lib/auth/config.ts:78-101`, `src/lib/auth/types.ts:26-44`
- **Confidence:** MEDIUM
- **Evidence:** `mapUserToAuthFields` returns an object literal with fields matching `AuthUserRecord`, but TypeScript does not enforce that the return type exactly matches. If a field is added to `AuthUserRecord` but forgotten in `mapUserToAuthFields`, the JWT token will silently miss that field. The `AUTH_PREFERENCE_FIELDS` constant helps for preference fields, but core fields are manually listed.
- **Suggested fix:** Add a type assertion: `return { ... } satisfies AuthUserRecord;` or declare the return type explicitly.

## CR13-V3 — [LOW] `syncTokenWithUser` manually assigns each field from `mapUserToAuthFields` output — could miss new fields

- **File:** `src/lib/auth/config.ts:119-137`
- **Confidence:** MEDIUM
- **Evidence:** After calling `mapUserToAuthFields(user)`, `syncTokenWithUser` manually assigns `token.preferredLanguage = fields.preferredLanguage`, `token.shareAcceptedSolutions = fields.shareAcceptedSolutions`, etc. If a new field is added to `mapUserToAuthFields`, it must also be added to `syncTokenWithUser`. This is the same "triple mapping" anti-pattern that was partially fixed by extracting `mapUserToAuthFields` in cycle 10, but the manual token assignment remains.
- **Suggested fix:** Replace the individual assignments with `Object.assign(token, fields)` or a loop over `AUTH_TOKEN_FIELDS`, preserving `token.authenticatedAt` separately.

---

## Final Sweep

- Verified that `authorizeRecruitingToken` now correctly uses `mapUserToAuthFields` and reads `mustChangePassword` from the DB (cycle 12 fix confirmed working).
- Verified that `clearAuthToken` sets `authenticatedAt = 0` to prevent the iat-fallback bypass.
- Verified that `isTokenInvalidated` correctly compares authenticatedAt against tokenInvalidatedAt.
- The `AUTH_PREFERENCE_FIELDS` constant is correctly used in `AUTH_USER_COLUMNS`, `AUTH_TOKEN_FIELDS`, and the DB column selection.
