# Cycle 20 Debugger Findings

**Date:** 2026-04-19
**Reviewer:** Latent bug surface, failure modes, regressions
**Base commit:** 95f06e5b

---

## Findings

### F1: ALS cache is dead code — latent production bug where N+1 queries persist

- **File**: `src/lib/recruiting/request-cache.ts:51-55`, `src/lib/recruiting/access.ts:38,88`
- **Severity**: HIGH
- **Confidence**: HIGH
- **Description**: The `setCachedRecruitingContext` function has a silent failure mode: when `recruitingContextStore.getStore()` returns `undefined` (which it always does because the store is never initialized), the function silently returns without setting anything. This is documented as "graceful degradation" but it's actually a bug: the code was written assuming the store would be initialized by `withRecruitingContextCache`, but no caller ever does so. The result is that the ALS cache path is completely dead in production.
- **Concrete failure scenario**: In production, an API route handler for community threads calls `canAccessProblem` in a loop. Each call triggers `loadRecruitingAccessContext`, which calls `getCachedRecruitingContext` (returns undefined), then queries the DB twice, then calls `setCachedRecruitingContext` (silently no-ops). The N+1 query problem from AGG-1 (cycle 19) is NOT fixed.
- **Suggested fix**: Wire `withRecruitingContextCache` into the API handler pipeline. Additionally, add a development-mode log when `setCachedRecruitingContext` fails to set because the store is not active, so developers are alerted to misconfiguration.

### F2: `setCachedRecruitingContext` silently no-ops — should warn when store is not active

- **File**: `src/lib/recruiting/request-cache.ts:51-55`
- **Severity**: LOW
- **Confidence**: HIGH
- **Description**: When the ALS store is not active, `setCachedRecruitingContext` silently does nothing. This is the "graceful degradation" mentioned in the comments, but it masks a critical integration bug. The function should at least log a warning in development mode when the store is not active, similar to how `isTrustedServerActionOrigin` logs warnings when bypassing checks.
- **Suggested fix**: Add a `logger.warn` call in `setCachedRecruitingContext` when `store` is undefined and `NODE_ENV !== "production"`.

---

## Verified Safe

### VS1: Breadcrumb component handles locale stripping correctly
- **File**: `src/components/layout/breadcrumb.tsx:52-55`
- The regex `/^\/(en|ko)(?=\/|$)/` correctly strips locale prefixes. The `titleCase` fallback handles unknown segments.
