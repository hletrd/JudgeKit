# Cycle 12 — Tracer

**Date:** 2026-04-19
**Base commit:** 2339c7ea

## Causal Traces

### Trace 1: Recruiting Token Auth -> Forced Password Change Bypass

**Flow:**
1. Admin sets `mustChangePassword = true` for user X (via admin panel)
2. User X opens recruiting invitation link `/recruit/TOKEN`
3. `authorizeRecruitingToken` is called
4. DB query fetches user data but does NOT include `mustChangePassword` column (line 28-48)
5. Function hardcodes `mustChangePassword: false` (line 62)
6. `createSuccessfulLoginResponse` is NOT called — the function directly returns an `AuthenticatedLoginUser`
7. The `jwt` callback runs, `syncTokenWithUser` sets `token.mustChangePassword = false`
8. Proxy middleware checks `activeUser.mustChangePassword` — sees `false`
9. User accesses dashboard without password change — **bypass successful**

**Root cause:** `authorizeRecruitingToken` does not read `mustChangePassword` from DB and hardcodes `false`.
**Severity:** MEDIUM
**Confidence:** HIGH

### Trace 2: Recruiting Token Auth -> New Preference Field Silently Missed

**Flow:**
1. Developer adds a new preference field (e.g., `preferredCodeFont`) to `AUTH_PREFERENCE_FIELDS`
2. Developer updates `mapUserToAuthFields` to include the new field
3. Developer updates `AuthUserRecord` and `AuthUserInput` types
4. Developer does NOT update `authorizeRecruitingToken` (it's in a different file)
5. User authenticates via recruiting token -> new field missing from session -> defaults applied instead of DB values
6. This is the exact same class of bug as the `shareAcceptedSolutions` issue fixed in cycle 10

**Root cause:** `authorizeRecruitingToken` bypasses `mapUserToAuthFields`, creating a parallel field list.
**Severity:** MEDIUM
**Confidence:** HIGH

### Trace 3: Rate Limit `blockedUntil || null` vs `blockedUntil > 0 ? blockedUntil : null` Divergence

**Flow:**
1. `consumeRateLimitAttemptMulti` stores `blockedUntil > 0 ? blockedUntil : null` (correct, line 175)
2. `recordRateLimitFailure` stores `blockedUntil || null` (falsy coercion, line 215)
3. If `blockedUntil` were ever `0`, `consumeRateLimitAttemptMulti` would store `null`, but `recordRateLimitFailure` would also store `null` (same outcome)
4. If `blockedUntil` were a positive number, both would store the same value
5. **Current outcome:** No practical difference, but the inconsistency is a code smell that could cause bugs if the block calculation changes.

**Root cause:** Two developers used different null-coalescing patterns.
**Severity:** LOW
**Confidence:** MEDIUM
