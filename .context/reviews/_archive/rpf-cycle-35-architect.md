# RPF Cycle 35 — Architect Review

**Date:** 2026-04-23
**Base commit:** 218a1a93

## ARCH-1: Inconsistent error handling pattern between createApiHandler routes and manual routes [MEDIUM/MEDIUM]

**Files:** `src/lib/api/handler.ts`, `src/app/api/v1/admin/migrate/import/route.ts`, `src/app/api/v1/admin/restore/route.ts`, `src/app/api/v1/submissions/[id]/events/route.ts`

**Description:** The codebase has two distinct patterns for API route handlers: (1) the `createApiHandler` framework that provides standardized auth, CSRF, rate limiting, body parsing, and error handling; and (2) manual route implementations with their own try/catch blocks. The SSE route, migrate/import route, and restore route use the manual pattern. This creates an architectural consistency problem where:
- New developers don't know which pattern to follow
- Manual routes may miss security checks (e.g., the SSE route has its own rate limiting but different error format)
- Error responses differ between the two patterns (manual routes return `NextResponse.json` directly, while `createApiHandler` wraps errors with `Cache-Control: no-store`)

The migrate/import and restore routes share nearly identical auth+CSRF+rate-limit+password-verify boilerplate that `createApiHandler` already provides.

**Concrete failure scenario:** A developer adds a new admin route using the manual pattern, forgetting to add the CSRF check that `createApiHandler` automatically provides. The route is vulnerable to CSRF attacks.

**Fix:** Extend `createApiHandler` to support the multipart file upload path (currently the main reason these routes can't use it). For the SSE route, document the architectural decision for why it remains manual.

**Confidence:** HIGH

---

## ARCH-2: Global mutable state for timers lacks coordination across HMR boundaries [LOW/MEDIUM]

**Files:** `src/app/api/v1/submissions/[id]/events/route.ts:77-115`, `src/lib/audit/events.ts:203-215`, `src/lib/security/rate-limit.ts:50-64`, `src/lib/data-retention-maintenance.ts:103-109`

**Description:** Four separate modules use `globalThis.__xxxTimer` to persist timers across HMR (Hot Module Replacement) in development. Each implements the same pattern: check if timer exists, clear it, create a new one, call `.unref()`. This is a DRY violation across modules and could be extracted into a shared utility. More importantly, there's no coordination — if the process is shutting down, there's no guarantee these timers are cleaned up in a specific order, which could lead to attempts to use already-closed DB connections.

**Concrete failure scenario:** During graceful shutdown, the SSE cleanup timer fires after the DB connection pool is closed, causing an unhandled promise rejection that crashes the process before the audit buffer flush completes.

**Fix:** Extract a `createManagedInterval(fn, ms, globalKey)` utility that handles the HMR-safe timer pattern. Register all managed timers with the node-shutdown handler for coordinated cleanup.

**Confidence:** MEDIUM

---

## ARCH-3: Console.error in client components leaks into production without structured context [LOW/MEDIUM]

**Files:** Discussion components and group dialogs (see code-reviewer CR-2/CR-3)

**Description:** Client-side components use `console.error` for error logging. While client-side code cannot use the server-side structured logger, this creates a gap where client errors are invisible to the server-side observability pipeline. The server API routes that these components call already log errors via the structured logger, but the client-side context (what the user was doing, component state) is lost.

**Fix:** Consider adding a lightweight client-side error reporting endpoint or integrating with an error tracking service. At minimum, ensure the API routes that these components call log enough context server-side to reconstruct the failure.

**Confidence:** LOW
