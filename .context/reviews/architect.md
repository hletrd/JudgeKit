# Architect — Cycle 25

Reviewer: architect
Date: 2026-05-09
Scope: Architectural/design risks, coupling, layering
Base commit: 75d82a17

## Summary

No new architectural risks. The codebase maintains clean separation of concerns. One carry-forward inconsistency noted.

---

## Findings

### AR-25-1: Transaction wrapper inconsistency in judge/poll

- **File**: `src/app/api/v1/judge/poll/route.ts:77,136`
- **Severity**: Low
- **Confidence**: High

**Description**: Using `execTransaction` in one path and `db.transaction` in another breaks the abstraction layer. If `execTransaction` later adds retries, metrics, or logging, the direct `db.transaction` path would miss these behaviors.

**Fix**: Standardize on `execTransaction` throughout.

---

## Verified Architecture

- **API Layer**: `createApiHandler` provides consistent middleware (auth, CSRF, rate limit, validation). No route bypasses this.
- **Database Layer**: All DB access through Drizzle ORM. Schema centralized in `schema.pg.ts`.
- **Auth Layer**: Session management abstracted behind `getApiUser`, `createApiHandler`, proxy middleware.
- **File Layer**: Storage operations abstracted behind `src/lib/files/storage.ts`.
- **Judge Layer**: Execution delegated to Rust sidecar or local Docker with clear boundaries.
- **Client Layer**: API calls go through `apiFetch`/`apiFetchJson` wrapper.
- **Abort Utilities**: New `src/lib/abort.ts` module provides shared timeout primitives used by both client and server fetch wrappers.

## Coupling Check

- No direct DB imports in components
- No circular dependencies in key modules
- Rust/TS interop is clean with typed interfaces
- Docker client abstraction (`src/lib/docker/client.ts`) isolates Docker CLI calls

---

## Final Sweep

No new architectural risks identified.
