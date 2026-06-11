# Verifier — Cycle 14

**Date:** 2026-04-24
**Base commit:** ca6b7d84

## CR14-V1: `mapTokenToSession` does not automatically cover new `AUTH_PREFERENCE_FIELDS` — field addition risk

- **Severity:** MEDIUM
- **Confidence:** HIGH
- **File:** `src/lib/auth/config.ts:142-168`
- **Evidence:** I verified the code path: when a user logs in, `syncTokenWithUser` (line 122) writes all `mapUserToAuthFields` output to the JWT token via `Object.assign`. On subsequent JWT refreshes (jwt callback, line 402), the same `Object.assign` path is used. However, when the session is built from the token (session callback, line 408), `mapTokenToSession` is called, which manually assigns each preference field. If a field exists in the JWT but is not listed in `mapTokenToSession`, it will be present in the token but absent from the session object. The client-side code that reads `session.user.preferredLanguage` (for example) would get `undefined` instead of the actual value.
- **Verification test:** Adding a new field to `AUTH_PREFERENCE_FIELDS` and `mapUserToAuthFields` without adding it to `mapTokenToSession` would result in the session missing that field. This is the exact same failure mode as the `shareAcceptedSolutions` incident from cycle 10.
- **Suggested fix:** Same as CR14-CR1.

## CR14-V2: Rate-limit clock source audit — `rate-limit.ts` uses `Date.now()` for 6+ comparison points against DB-stored values

- **Severity:** MEDIUM
- **Confidence:** HIGH
- **File:** `src/lib/security/rate-limit.ts`
- **Evidence:** I traced all `Date.now()` usages in this file:
  1. Line 39: `evictStaleEntries` — `cutoff = Date.now() - RATE_LIMIT_EVICTION_AGE_MS` vs `lastAttempt` (DB time)
  2. Line 77: `getEntry` — `const now = Date.now()` for all window/blocked-until comparisons
  3. Lines 99, 150: derived from `getEntry` return value

  The `rateLimits` table is written to by both `api-rate-limit.ts` (using DB time) and `rate-limit.ts` itself (using `Date.now()`). The mixed clock sources in the same table mean that any row can contain values written with different clocks.
- **Suggested fix:** Same as CR14-SR1.

## Verified Prior Fixes

- F1 (`json_extract` in PostgreSQL): No matches in grep, confirmed fixed
- F2 (`DELETE ... LIMIT`): All use `ctid IN (SELECT ctid ... LIMIT)`, confirmed fixed
- CR9-CR1 (auth field mapping centralization): `mapUserToAuthFields()` centralizes, confirmed
- CR9-SR1 (SSE re-auth race): Re-auth awaits before processing, confirmed
- CR9-SR3 (tags route rate limiting): Uses `createApiHandler` with `rateLimit: "tags:read"`, confirmed
- CR11-1 (encryption bypass via prefix): Checks `isValidEncryptedPluginSecret`, confirmed
