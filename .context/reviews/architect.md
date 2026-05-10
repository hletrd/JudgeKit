# Architecture Review — Cycle 34

**Reviewer:** architect
**Date:** 2026-05-10
**Scope:** Design patterns, coupling, module boundaries, API consistency

---

## Findings

### C34-AR-1: [MEDIUM] Rate limit module has no lifecycle management

**File:** `src/lib/security/rate-limit.ts:68-80`
**Confidence:** HIGH

The rate limit eviction timer is started once at module load time via `startRateLimitEviction()`. There is no corresponding lifecycle teardown. This violates the principle that background processes should be controllable. In serverless or test environments, uncontrolled timers can cause:
- Open handle warnings in tests
- Resource leaks in long-running processes
- Unclean shutdowns

**Fix:** Export `stopRateLimitEviction()` and document when to call it.

---

### C34-AR-2: [LOW] `apiFetchJson` silent failure mode hinders debugging

**File:** `src/lib/api/client.ts:138-144`
**Confidence:** MEDIUM

The `apiFetchJson` helper's design philosophy is "safe parsing eliminates footguns." However, the complete silence on parse failures in development contradicts the module's own documentation which states "Never silently swallow errors — always surface them to the user." The silent catch is a deliberate trade-off for production safety, but the development experience suffers.

**Fix:** Add a development-only logging path that preserves production silence.

---

### C34-AR-3: [LOW] Two rate limit modules share schema but have divergent logic

**Files:** `src/lib/security/rate-limit.ts`, `src/lib/security/api-rate-limit.ts`
**Confidence:** LOW

The codebase has two rate limit modules that write to the same `rateLimits` table:
- `rate-limit.ts`: login/auth limits with exponential backoff
- `api-rate-limit.ts`: API limits with fixed windows

The module comments explicitly note this: "Drift between the two is tracked under C7-AGG-9." The divergence is intentional (different use cases need different algorithms) but creates maintenance risk when fixing bugs.

**Status:** Known architectural debt, tracked since cycle 7. No action needed unless bugs are found.

---

## Previously Deferred Architecture Items (re-validated)

- H-4 (In-memory rate limiter): **FIXED** — consolidated to DB-backed only
- C25-7 (WeakMap complexity): Unchanged
- C33-AR-1 (timer logic duplication): Partially addressed — no shared hook yet extracted

## Positive Observations

1. `createApiHandler` provides a consistent middleware wrapper for all API routes.
2. `apiFetch`/`apiFetchJson`/`parseApiResponse` form a clear client-side API utility hierarchy.
3. DB time utilities (`getDbNow`, `getDbNowMs`) centralize temporal authority.
4. Auth module separates concerns: config, permissions, sessions, tokens.
