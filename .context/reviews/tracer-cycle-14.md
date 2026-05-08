# Tracer — Cycle 14

**Date:** 2026-04-24
**Base commit:** ca6b7d84

## Flow 1: Auth field propagation — token has field but session does not

- **Hypothesis:** A new preference field added to `AUTH_PREFERENCE_FIELDS` will be present in the JWT token but missing from the session object.
- **Trace:**
  1. User logs in -> `authorize()` -> `createSuccessfulLoginResponse(user)` -> `mapUserToAuthFields(user)` (all fields included)
  2. JWT callback -> `syncTokenWithUser(token, user, authenticatedAtSeconds)` -> `Object.assign(token, fields)` (all fields included in JWT)
  3. Session callback -> `mapTokenToSession(token, session)` -> manual field assignment (field may be missing)
  4. Client reads `session.user.newField` -> `undefined`
- **Result:** CONFIRMED — the data loss occurs at step 3. The token is correct; the session is incomplete.
- **Severity:** MEDIUM / HIGH confidence

## Flow 2: Rate-limit clock skew — mixed timestamps in same table row

- **Hypothesis:** A rate-limit row can contain timestamps written with different clocks.
- **Trace:**
  1. User hits API endpoint -> `consumeApiRateLimit` -> `atomicConsumeRateLimit` -> writes `windowStartedAt = await getDbNowMs()` (DB time)
  2. User fails login -> `consumeRateLimitAttemptMulti` -> `getEntry(key, tx)` -> `now = Date.now()` (app time) -> updates `lastAttempt = now` (app time)
  3. Same row now has `windowStartedAt` in DB time and `lastAttempt` in app time
- **Result:** CONFIRMED — mixed clock sources in the same row.
- **Severity:** MEDIUM / HIGH confidence

## Flow 3: ContestsLayout `javascript:` check bypass

- **Hypothesis:** A crafted `blob:` or `vbscript:` URL could bypass the scheme check.
- **Trace:**
  1. User clicks link with `data-full-navigate` attribute
  2. Handler checks `href.startsWith("javascript:")` and `href.startsWith("data:")` -> both false for `blob:...`
  3. `me.preventDefault()` + `window.location.href = href` -> navigates to blob URL
- **Result:** Technically CONFIRMED but LOW risk — DOMPurify sanitizes HTML, and React's JSX rendering prevents injection of arbitrary attributes. The `data-full-navigate` attribute must be explicitly added by a developer.
- **Severity:** LOW / LOW confidence
