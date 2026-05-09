# Architect — Cycle 16 Review

**Date:** 2026-05-09
**HEAD:** 64de91dd
**Scope:** Architectural/design risks, coupling, layering

## Summary

No new architectural issues. The codebase maintains clean separation of concerns. One minor observation about cross-layer consistency.

## Findings

### AR-1: Inconsistent fetch wrapper timeout strategy across layers [LOW]

- **Files:** `src/lib/api/client.ts:88`, `src/lib/docker/client.ts:112`, `:144`
- **Confidence:** Medium
- **Severity:** Low
- **Problem:** Both the client-side `apiFetch` and server-side `callWorkerJson`/`callWorkerNoContent` use the same timeout pattern (`signal = init?.signal ?? AbortSignal.timeout(N)`). While the server-side impact is lower (Node.js always supports `AbortSignal.timeout`), the architectural inconsistency means fixes must be applied in multiple places.
- **Recommendation:** Extract a shared `withDefaultTimeout(signal?, timeoutMs)` utility to `src/lib/utils.ts` or a new `src/lib/timeouts.ts` module. This centralizes the timeout logic, ensures consistency, and makes the browser fallback available everywhere.

## Verified Architecture

- **API Layer:** `createApiHandler` provides consistent middleware (auth, CSRF, rate limit, validation) across all routes. No route bypasses this abstraction.
- **Database Layer:** All DB access goes through Drizzle ORM. Schema definitions in `schema.pg.ts` are centralized.
- **Auth Layer:** Session management is abstracted behind `getApiUser`, `createApiHandler`, and proxy middleware.
- **File Layer:** Storage operations are abstracted behind `src/lib/files/storage.ts`.
- **Judge Layer:** Execution is delegated to Rust sidecar or local Docker, with clear boundaries.
- **Client Layer:** API calls go through `apiFetch`/`apiFetchJson` wrapper.

## Coupling Check

- No direct DB imports in components (all go through API routes or server actions)
- No circular dependencies found in key modules
- Rust/TS interop is clean with typed interfaces

## Prior Fixes Verified

| Finding | Status |
|---|---|
| C14 language-config-table shared AbortController | Fixed — now uses separate refs per operation |

## Final Sweep

No new architectural risks identified.
