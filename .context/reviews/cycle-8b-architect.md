# Architect Review — Cycle 8

## Findings

### C8-ARCH-1: Rate-limiting architecture has two divergent implementations
- **File**: `src/lib/security/rate-limit.ts` vs `src/lib/security/api-rate-limit.ts`
- **Severity**: MEDIUM | **Confidence**: High
- **Issue**: The codebase has two separate rate-limiting modules that write to the same `rateLimits` table but with different semantics: `rate-limit.ts` uses exponential backoff (`consecutiveBlocks`) for login/auth, while `api-rate-limit.ts` uses fixed blocking. Both implement their own atomic check+increment logic with slight differences. This is a DRY violation that increases maintenance burden and divergence risk. A comment in `api-rate-limit.ts` references "C7-AGG-9" for consolidation but no action has been taken.
- **Fix**: Consolidate into a single rate-limit module with configurable backoff strategy.

### C8-ARCH-2: `createApiHandler` doesn't support user-level rate limiting
- **File**: `src/lib/api/handler.ts` lines 92-201
- **Severity**: LOW | **Confidence**: High
- **Issue**: The `createApiHandler` wrapper supports `rateLimit: string` which calls `consumeApiRateLimit` (IP-based). But `consumeUserApiRateLimit` (user-ID-based) exists and is more appropriate for authenticated endpoints, yet there's no way to opt into it via the handler config. Currently, callers must manually call `consumeUserApiRateLimit` inside their handler, bypassing the middleware layer.
- **Fix**: Add a `userRateLimit` option to `HandlerConfig` that uses `consumeUserApiRateLimit`.

### C8-ARCH-3: Auth context assembly is spread across too many layers
- **Severity**: LOW | **Confidence**: Medium
- **Issue**: Auth context flows through: next-auth JWT callback -> `syncTokenWithUser` -> `mapTokenToSession` -> session callback -> client components. The token fields are set via `Object.assign(token, fields)` at line 122 of config.ts, then mapped again in `mapTokenToSession`. Two separate field lists (`AUTH_CORE_FIELDS` and `AUTH_PREFERENCE_FIELDS`) must stay in sync across 4 different locations. Adding a new preference field requires changes in: `AUTH_PREFERENCE_FIELDS`, `mapUserToAuthFields`, `next-auth.d.ts`, and `mapTokenToSession`. This is fragile.
- **Fix**: Consider a single source-of-truth field definition that generates both the token and session mappings.

### C8-ARCH-4: Recruiting module has no clear boundary — business logic leaks into auth layer
- **File**: `src/lib/auth/config.ts` lines 203-239 vs `src/lib/assignments/recruiting-invitations.ts`
- **Severity**: LOW | **Confidence**: High
- **Issue**: The auth config's `authorize` function contains recruiting-token-specific rate-limiting logic (lines 204-213) and auth flow logic (lines 215-238). This means the auth layer knows about recruiting domain concepts. The `authorizeRecruitingToken` function in `recruiting-token.ts` is a better boundary, but the rate-limit consumption still happens in the auth config rather than being delegated.
- **Fix**: Move the rate-limit consumption for recruiting tokens into `authorizeRecruitingToken` so the auth config only calls a single `authorizeRecruitingToken` function.
