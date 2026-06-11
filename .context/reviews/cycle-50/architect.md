# Cycle 50 — Architect

**Date:** 2026-05-13
**HEAD reviewed:** `898684e6`
**Prior aggregate:** `_aggregate-cycle-49.md` (HEAD `17a35892`)

## Scope
Architectural review of changes since cycle 49. Examined coupling, layering, consistency, and design decisions.

---

## NEW Findings

### C50-AR-1: Handler pattern inconsistency growing
- **Severity:** LOW
- **Confidence:** MEDIUM
- **Problem:** Two auth endpoints (`verify-email`, `reset-password`) continue to use manual handler patterns while the rest of the API uses `createApiHandler`. This inconsistency has existed for multiple cycles and is growing technical debt. These routes miss automatic CSRF protection, standardized headers, and consistent error response shapes.
- **Fix:** Create a migration plan to move all remaining manual handlers to `createApiHandler`. Routes to migrate: `verify-email`, `reset-password`, and any others found in a grep sweep.

### C50-AR-2: Rate limit strategy dual-layer complexity
- **Severity:** LOW
- **Confidence:** LOW
- **File:** `src/app/api/v1/auth/resend-verification/route.ts`
- **Problem:** The route uses both `createApiHandler` rate limiting (Redis/sliding window via `consumeApiRateLimit`) AND manual attempt-based rate limiting (`consumeRateLimitAttemptMulti`). This dual-layer approach is defensible but adds cognitive load. Document the rationale.
- **Fix:** Add a comment explaining why both layers are needed (global rate limit vs per-user/per-IP limits).

### C50-AR-3: Positive architectural changes
- **Transaction wrapping:** Multiple endpoints now wrap related operations in transactions (deregister, bulk rejudge, token operations). Good progression toward atomic mutations.
- **DB time consistency:** `getDbNowUncached` usage is now more consistent — fetched outside transactions where possible, used inside for temporal comparisons.
- **Cache invalidation:** Centralized `invalidateRankingCache` called after all submission mutations. Good pattern.
- **Schema coercion:** `coerceNullableNumber` in `judge/claim` provides runtime validation for raw SQL results. Good defense against type drift.

---

## Carry-forward
- No new architectural risks introduced this cycle.
- The codebase continues to mature with incremental hardening.
