# Architect — Cycle 14

**Date:** 2026-04-24
**Base commit:** ca6b7d84

## CR14-AR1: `mapTokenToSession` manual field assignments remain a DRY violation and fragility source

- **Severity:** MEDIUM
- **Confidence:** HIGH
- **File:** `src/lib/auth/config.ts:142-168`
- **Evidence:** The `syncTokenWithUser` function was correctly refactored to use `Object.assign(token, fields)` (line 122), making it automatically resilient to new preference fields. But `mapTokenToSession` (lines 142-168) still requires a manual line for each preference field. This is an architectural inconsistency: one path is automated, the other is manual. The comment on line 157 explicitly lists 4 places that must be updated when adding a field — this is a code smell indicating the abstraction is incomplete.
- **Suggested fix:** Refactor `mapTokenToSession` to iterate over `AUTH_PREFERENCE_FIELDS` for preference fields, keeping core fields explicit. This makes the two mapping functions consistent in their resilience to new fields.

## CR14-AR2: Rate-limit time source inconsistency is an architectural gap, not just a bug

- **Severity:** MEDIUM
- **Confidence:** HIGH
- **Files:** `src/lib/security/rate-limit.ts`, `src/lib/security/api-rate-limit.ts`, `src/lib/security/in-memory-rate-limit.ts`
- **Evidence:** The codebase now has three rate-limiting implementations with inconsistent clock sources:
  1. `api-rate-limit.ts` — uses `getDbNowMs()` (DB time) for `atomicConsumeRateLimit` and `checkServerActionRateLimit`
  2. `rate-limit.ts` — uses `Date.now()` for `getEntry()`, `evictStaleEntries()`, and all login rate-limit functions
  3. `in-memory-rate-limit.ts` — uses `Date.now()` throughout (acceptable for in-process)

  The `rate-limit.ts` functions (`consumeRateLimitAttemptMulti`, `recordRateLimitFailure`, etc.) are used for login rate limiting, which is the most security-sensitive rate-limit path. These functions write `lastAttempt` and `blockedUntil` using `Date.now()` into the same `rateLimits` table that `atomicConsumeRateLimit` writes to using DB time. This creates mixed clock sources in the same table rows.
- **Suggested fix:** Establish a single time source for all DB-backed rate-limit operations. Migrate `rate-limit.ts` to use `getDbNowMs()` consistently. Document that `in-memory-rate-limit.ts` uses `Date.now()` by design (single-process store).

## CR14-AR3: `ContestsLayout` workaround for Next.js RSC streaming bug is not tracked with a specific upstream issue

- **Severity:** LOW
- **Confidence:** MEDIUM
- **File:** `src/app/(dashboard)/dashboard/contests/layout.tsx`
- **Evidence:** The TODO comment says "Remove this workaround once the upstream Next.js bug is fixed" and mentions searching for or filing an issue, but no issue number is referenced. This workaround forces full-page navigation on certain links, which is a performance regression (no client-side navigation). Without an upstream issue, this workaround may persist indefinitely.
- **Suggested fix:** File a Next.js issue for the RSC streaming corruption with proxy headers, reference it in the TODO comment, and add a test that validates the workaround can be safely removed when the upstream fix lands.

## Verified Prior Fixes

- Navigation items centralized in `public-nav.ts` (verified)
- `syncTokenWithUser` uses `Object.assign` (verified)
