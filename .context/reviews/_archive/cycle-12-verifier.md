# Cycle 12 — Verifier

**Date:** 2026-04-19
**Base commit:** 2339c7ea

## Findings

### CR12-V1 — [MEDIUM] `authorizeRecruitingToken` hardcodes `mustChangePassword: false` — bypasses forced password change

- **File:** `src/lib/auth/recruiting-token.ts:62`
- **Confidence:** HIGH
- **Evidence:** The function constructs the return value with `mustChangePassword: false` regardless of the actual DB value. If an admin has set `mustChangePassword = true` for a user (e.g., after a security incident), that user can bypass the forced password change by authenticating via a recruiting token. The proxy middleware (proxy.ts line 307-312) redirects to `/change-password` when `activeUser.mustChangePassword` is true, but this only works if the field is correctly set in the auth flow.
  - Scenario: Admin flags user for password change -> User opens recruiting link -> Logs in via recruiting token with mustChangePassword=false -> Never redirected to /change-password.
- **Suggested fix:** Read `mustChangePassword` from the DB query result (it's already queried on line 48, just not included in the columns) and pass the actual value.

### CR12-V2 — [LOW] `authorizeRecruitingToken` does not select `mustChangePassword` or `tokenInvalidatedAt` from DB

- **File:** `src/lib/auth/recruiting-token.ts:28-48`
- **Confidence:** HIGH
- **Evidence:** The DB query on lines 28-48 explicitly selects columns but omits `mustChangePassword` and `tokenInvalidatedAt`. These are core auth fields needed for security checks. Without `tokenInvalidatedAt`, the function cannot check if the user's tokens have been invalidated (e.g., after an admin-initiated password reset).
- **Suggested fix:** Add `mustChangePassword` and `tokenInvalidatedAt` to the columns selection.

### CR12-V3 — [LOW] `clearAuthToken` iterates AUTH_TOKEN_FIELDS but uses `delete token[field as keyof JWT]` — TypeScript allows any key

- **File:** `src/lib/auth/session-security.ts:69`
- **Confidence:** MEDIUM
- **Evidence:** The `field as keyof JWT` cast is a type assertion that bypasses TypeScript's type checking. While functionally correct (the JWT type is loosely typed as `Record<string, unknown>`), it means the compiler cannot catch if a field name is misspelled in AUTH_TOKEN_FIELDS.
- **Suggested fix:** This is acceptable given the JWT type's loose nature, but worth noting as a type safety gap.

### CR12-V4 — [LOW] `validateExport` does not check for duplicate table names

- **File:** `src/lib/db/export.ts:269-328`
- **Confidence:** MEDIUM
- **Evidence:** When iterating `tables` entries, the function checks if each table name is in `knownTables`, but does not check for duplicate table names in the export data. If the same table appears twice, the second entry would silently overwrite the first during import. This was identified in cycle 10 (D17) and deferred.
- **Suggested fix:** Track seen table names and flag duplicates.

## Verified Fixes (Previously Reported)

- Cycle 11 AGG-1: `authorize()` and `jwt()` now pass DB user directly to `mapUserToAuthFields` — VERIFIED
- Cycle 11 AGG-2: `AUTH_TOKEN_FIELDS` derived from `AUTH_PREFERENCE_FIELDS` — VERIFIED
- Cycle 11 AGG-6/7: SSE stream close guards and cleanup early return — VERIFIED
