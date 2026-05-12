# Architectural Review — Cycle 7

**Reviewer:** architect (orchestrator direct)
**Date:** 2026-05-11
**Scope:** Architectural risks, coupling, layering, and design debt

---

## New Findings

### LOW

#### C7-ARCH-1: Compiler Execution Has Dual Code Paths (Rust Runner vs Local Fallback)
- **File:** `src/lib/compiler/execute.ts`
- **Confidence:** Medium
- **Description:** The compiler module supports both a Rust runner sidecar and a local Docker fallback. The local fallback is complex (workspace creation, chmod, Docker spawn, cleanup) and duplicates logic that also exists in the Rust worker. Maintenance of two execution paths increases bug surface.
- **Fix:** Eventually deprecate local fallback in production. For now, ensure both paths have identical security/timeout/resource policies.

---

## Unfixed from Prior Cycles

#### M4: `rateLimits` Table Overloaded for Three Different Concerns (Cycle 6)
- **File:** `src/lib/realtime/realtime-coordination.ts`
- **Confidence:** High
- **Description:** The `rateLimits` table is used for (1) API rate limiting, (2) SSE connection slot tracking, and (3) heartbeat deduplication. These are semantically different concerns. The table schema has fields like `attempts`, `consecutiveBlocks`, and `blockedUntil` which make sense for rate limiting but are meaningless for SSE slots.
- **Fix:** Create separate tables for SSE connection slots and heartbeat tracking, or add a `category` column with stricter validation.

#### L12: SSE Events Route Has Dual Coordination Paths (Cycle 6)
- **File:** `src/app/api/v1/submissions/[id]/events/route.ts`
- **Confidence:** Medium
- **Description:** The SSE route switches between shared coordination (PostgreSQL-backed) and local coordination (in-memory Maps) based on `usesSharedRealtimeCoordination()`. This creates two significantly different execution paths that must be maintained and tested in parallel.
- **Fix:** Consider abstracting the coordination strategy behind an interface so the route handler is unaware of the implementation.

#### L13: `stopSharedPollTimer` Added But No `isSharedPollTimerRunning` Query Function (Cycle 6)
- **File:** `src/app/api/v1/submissions/[id]/events/route.ts:161-166`
- **Confidence:** Low
- **Description:** The timer can be stopped but its running state cannot be queried. This makes it impossible for the shutdown handler to know whether a poll is in progress before exiting.
- **Fix:** Export a boolean query function or promise-returning stop function.

---

## No Agent Failures

All review work performed directly by the orchestrator due to absence of registered Agent tools in this environment.
