# Debugger — Cycle 14

**Date:** 2026-04-24
**Base commit:** ca6b7d84

## CR14-DB1: `mapTokenToSession` silent field omission — same failure class as shareAcceptedSolutions bug

- **Severity:** MEDIUM
- **Confidence:** HIGH
- **File:** `src/lib/auth/config.ts:142-168`
- **Evidence:** Traced the auth data flow:
  1. DB query fetches user with all `AUTH_USER_COLUMNS` (derived from `AUTH_CORE_FIELDS` + `AUTH_PREFERENCE_FIELDS`)
  2. `mapUserToAuthFields` maps all fields to a plain object
  3. `syncTokenWithUser` uses `Object.assign(token, fields)` — all fields included automatically
  4. `mapTokenToSession` manually assigns each field — if a field is missing, the session silently omits it

  The failure mode is: token has the field, session does not. The client reads from `session.user.*`, so the user's preference appears to be null/default even though it was correctly stored in the JWT. This is a one-way data loss: the server-side JWT is correct, but the client never sees the value.

  **Latent bug surface:** If `mapTokenToSession` omits a field, there is no error, no warning, no logging. The user simply sees the default value. This makes the bug extremely hard to notice in production.

- **Suggested fix:** Same as CR14-CR1 — iterate over `AUTH_PREFERENCE_FIELDS` programmatically.

## CR14-DB2: Mixed clock timestamps in `rateLimits` table make failure diagnosis difficult

- **Severity:** LOW
- **Confidence:** MEDIUM
- **File:** `src/lib/security/rate-limit.ts`, `src/lib/security/api-rate-limit.ts`
- **Evidence:** If a user reports being incorrectly rate-limited (or not limited when they should be), investigating requires understanding which clock source was used for each field in the row. The `windowStartedAt` might be DB time (written by `atomicConsumeRateLimit`), while `lastAttempt` might be app-server time (written by `recordRateLimitFailure`). There is no way to distinguish which clock was used from the data alone.
- **Suggested fix:** When migrating to DB time consistently (per CR14-SR1), add a comment in the schema or code noting that all timestamps in `rateLimits` use DB server time.

## CR14-DB3: `handleSignOut` in `AppSidebar` still fires async function with `void`

- **Severity:** LOW
- **Confidence:** LOW
- **File:** `src/components/layout/app-sidebar.tsx`
- **Evidence:** This was flagged in cycle 13 as AGG-6 and deferred. The `void handleSignOut()` pattern means unhandled promise rejections from `signOut` are silently swallowed. Carried forward as a known deferred item.

## Verified Prior Fixes

- `syncTokenWithUser` uses `Object.assign` — verified at line 122
