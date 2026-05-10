# Architecture Review — Cycle 37

**Reviewer:** architect
**Date:** 2026-05-09
**HEAD:** 07174a9b

## Summary

0 new findings. Architecture remains sound with consistent patterns across modules.

## Reviewed Areas

### API Handler Factory
- `createApiHandler` provides consistent middleware wrapper for all API routes.
- Auth, CSRF, rate limiting, body parsing, and Zod validation are uniformly applied.
- 16 routes bypass the factory for legitimate reasons (judge worker endpoints, health checks, test seed, file serving, admin migration/backup).

### Rate Limiting
- Two modules (`rate-limit.ts` and `api-rate-limit.ts`) share the same DB table with different algorithms — intentional divergence documented.
- `stopRateLimitEviction()` now exported (cycle 34 fix), enabling proper lifecycle management.

### Client API Utilities
- `apiFetch` / `apiFetchJson` / `parseApiResponse` form a clear hierarchy.
- apiFetchJson development-only warning (cycle 35) preserves production silence while aiding debugging.

### Auth Module
- Separates concerns: config, permissions, sessions, tokens, login events.
- Preference fields automatically propagated via `AUTH_PREFERENCE_FIELDS`.

### Rust Worker
- Clean separation: api, comparator, config, docker, executor, languages, runner, types, validation.
- Sandboxing properly isolated in docker.rs.

## Deferred Architecture Items (unchanged)

- H-2: Problem-Set PATCH bypasses createApiHandler — FIXED (uses createApiHandler)
- H-3: Overrides route doesn't use createApiHandler — FIXED (uses createApiHandler)
- C25-7: WeakMap complexity — unchanged, not a current concern

## Conclusion

No new architectural issues found in this cycle.
