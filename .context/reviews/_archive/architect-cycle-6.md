# Architectural Review — Cycle 6 (Updated)

**Reviewer:** architect
**Date:** 2026-05-11
**Scope:** Real-time coordination, SSE architecture, auth session handling, compiler delegation

---

## HIGH

None.

---

## MEDIUM

### M1: `rateLimits` Table Overloaded for Three Different Concerns
- **File:** `src/lib/realtime/realtime-coordination.ts`
- **Confidence:** High
- **Description:** The `rateLimits` table is used for (1) API rate limiting, (2) SSE connection slot tracking, and (3) heartbeat deduplication. These are semantically different concerns. The table schema has fields like `attempts`, `consecutiveBlocks`, and `blockedUntil` which make sense for rate limiting but are meaningless for SSE slots (where `attempts=1` and `blockedUntil` is actually an expiry time). This creates coupling and makes the table schema a bottleneck for evolving any one concern independently.
- **Fix:** Create separate tables for SSE connection slots (`sse_connections`) and heartbeat tracking (`heartbeat_dedup`), or add a `category` column with stricter validation.

---

## LOW

### L1: SSE Events Route Has Dual Coordination Paths
- **File:** `src/app/api/v1/submissions/[id]/events/route.ts`
- **Confidence:** Medium
- **Description:** The SSE route supports both "shared coordination" (PostgreSQL-backed, multi-instance) and "local coordination" (in-memory Maps, single-instance). The branching logic (`useSharedCoordination`) permeates the entire handler, making the code harder to reason about and test. Every connection acquire/release path has two implementations.
- **Fix:** Extract an interface (`RealtimeCoordination`) with two implementations (`PgRealtimeCoordination`, `LocalRealtimeCoordination`) and inject the appropriate one based on environment config.

### L2: `stopSharedPollTimer` Added But No `isSharedPollTimerRunning` Query Function
- **File:** `src/app/api/v1/submissions/[id]/events/route.ts:161-166`
- **Confidence:** Low
- **Description:** The exported `stopSharedPollTimer` function was added for graceful shutdown, but there is no corresponding query function to check if the timer is running. This makes it difficult for health checks or monitoring to report whether the SSE polling subsystem is active.
- **Fix:** Export `isSharedPollTimerRunning()` for observability.

---

## Final Sweep Notes

- The modular structure of API routes (using `createApiHandler`) remains a strong architectural pattern.
- Capability-based authorization (`resolveCapabilities`) correctly decouples roles from permissions.
- The compiler delegation to Rust runner is well-structured with proper fallback handling.
