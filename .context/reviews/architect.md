# Architecture Review: JudgeKit

**Reviewer:** architect
**Date:** 2026-05-10
**Scope:** Architectural risks, coupling, layering, design risks

---

## Summary

The architecture is clean with good separation of concerns, but several design risks exist: monolithic handler factory, complex custom state management, mixed auth patterns, and in-memory audit buffering. These increase maintenance burden and make the system harder to extend.

---

## MEDIUM Severity

### 1. Monolithic Handler Factory Without Middleware Composition
**File:** `src/lib/api/handler.ts`
**Severity:** MEDIUM
**Confidence:** High

`createApiHandler` bakes auth, CSRF, rate limiting, body parsing, Zod validation, and response headers into a single 206-line function. There is no middleware composition mechanism. Adding a new cross-cutting concern (e.g., request logging, metrics, caching) requires modifying this central function.

**Risks:**
- Feature requests that need custom middleware ordering are hard to implement
- Testing individual middleware layers requires constructing full handlers
- No way to skip specific checks for specific routes without boolean flags

**Fix:** Consider a middleware chain pattern (similar to Express/Koa) where each concern is a composable function. Alternatively, use Next.js middleware for cross-cutting concerns.

### 2. Custom Store Implementation in useSourceDraft
**File:** `src/hooks/use-source-draft.ts`
**Severity:** MEDIUM
**Confidence:** High

The hook implements a mini-store with `useSyncExternalStore`, a no-op hydration subscription, manual listener management, and complex state transitions. This is ~430 lines for what could be a `useState` + `useEffect` pattern or a lightweight library like Zustand.

**Risks:**
- High bug surface for a non-core feature (draft persistence)
- Difficult to test and reason about
- The `subscribeToHydration` function is a no-op, making the `useSyncExternalStore` usage misleading

**Fix:** Simplify to `useState` with `useEffect` for persistence, or extract to a Zustand store.

### 3. Mixed Auth Patterns Across Routes
**File:** Multiple API routes
**Severity:** MEDIUM
**Confidence:** High

Some routes use `createApiHandler` (consistent pattern), others implement auth manually:
- `src/app/api/v1/files/[id]/route.ts` - manual `getApiUser` + `csrfForbidden`
- `src/app/api/v1/judge/poll/route.ts` - manual `isJudgeAuthorized`
- `src/app/api/v1/health/route.ts` - no auth

This inconsistency increases the risk of missing a security check during new route development.

**Fix:** Audit all routes and either migrate to `createApiHandler` or document why manual auth is required.

### 4. Module-Level Mutable State for Audit Buffer
**File:** `src/lib/audit/events.ts:140-142`
**Severity:** MEDIUM
**Confidence:** Medium

```typescript
let _auditBuffer: AuditEventRow[] = [];
let _flushTimer: ReturnType<typeof setInterval> | null = null;
```

Module-level mutable state makes testing difficult (tests can interfere with each other) and makes the code non-reentrant. In a serverless environment, this state would be lost between invocations.

**Fix:** Encapsulate in a class or factory function. Export a singleton for production but allow test code to create isolated instances.

### 5. Raw SQL CTE in Judge Claim Route
**File:** `src/app/api/v1/judge/claim/route.ts:150-259`
**Severity:** MEDIUM
**Confidence:** Medium

The judge claim endpoint uses a complex raw SQL CTE with `FOR UPDATE SKIP LOCKED`. While this is efficient and correct, it bypasses Drizzle's type safety and makes the code harder to maintain. Schema changes require updating both the Drizzle schema AND this raw SQL.

**Risks:**
- Schema drift not caught by TypeScript
- SQL syntax errors only caught at runtime
- Two query paths (with/without worker) duplicate logic

**Fix:** Add a comment linking the SQL to the Drizzle schema. Consider adding a runtime validation step that checks column names against the schema.

---

## LOW Severity

### 6. Score Computation Mixed with Result Building
**File:** `src/lib/judge/verdict.ts`
**Severity:** LOW
**Confidence:** Medium

`computeFinalJudgeMetrics` computes score, max execution time, and max memory in one function. These are separate concerns that could be split for better testability and reuse.

**Fix:** Split into `computeScore`, `computeMaxExecutionTime`, `computeMaxMemory`.

### 7. Compiler Execute Module Has Multiple Responsibilities
**File:** `src/lib/compiler/execute.ts`
**Severity:** LOW
**Confidence:** Medium

This 895-line module handles: Docker execution, Rust runner delegation, shell command validation, container cleanup, workspace management, and orphaned container cleanup. It violates the Single Responsibility Principle.

**Fix:** Split into: `docker-runner.ts`, `rust-runner.ts`, `shell-validator.ts`, `container-cleanup.ts`, `workspace-manager.ts`.

---

## Final Sweep

Architecture layers examined:
- API handler pattern: `src/lib/api/handler.ts`
- State management: `src/hooks/use-source-draft.ts`
- Auth consistency: Multiple API routes
- Audit system: `src/lib/audit/events.ts`
- Database access: `src/lib/db/queries.ts`, raw SQL in routes
- Compiler execution: `src/lib/compiler/execute.ts`
- Scoring logic: `src/lib/judge/verdict.ts`

Overall the architecture is solid. The main risks are around maintainability and extensibility rather than correctness.
