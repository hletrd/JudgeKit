# Architect — Cycle 5

**Reviewer:** architect
**Base commit:** 6bb2b2eb
**Date:** 2026-05-14

## Findings

### A5-1: `rateLimits` table overloaded for three semantically different concerns [MEDIUM]

- **File:** `src/lib/realtime/realtime-coordination.ts:134-142, 190-198`, `src/lib/security/api-rate-limit.ts:84-92, 268-280`
- **Confidence:** High
- **Description:** The `rateLimits` table stores (1) API rate-limit counters with `attempts`, `consecutiveBlocks`, `blockedUntil`, (2) SSE connection slots with `key = realtime:sse:user:...`, and (3) heartbeat deduplication records with `key = realtime:heartbeat:...`. The schema fields like `attempts`, `consecutiveBlocks`, and `blockedUntil` are meaningful for rate limiting but semantically meaningless for SSE slots and heartbeats. SSE slots use `blockedUntil` as an expiration time, and heartbeats use `lastAttempt` as a dedup timestamp. This overload couples three independent subsystems to one table, making migrations and optimizations difficult.
- **Fix:** Create separate tables: `sse_connection_slots` and `heartbeat_records`, or add a `category` enum column to `rateLimits` with per-category cleanup policies.

### A5-2: Source code size validation mismatch between API schema and execution layer [LOW]

- **File:** `src/app/api/v1/compiler/run/route.ts:18-23`, `src/lib/compiler/execute.ts:19, 659-670`
- **Confidence:** High
- **Description:** Same as C5-2. The API layer and execution layer use different size units (string length vs UTF-8 bytes). This architectural inconsistency means the API contract does not match the runtime enforcement.
- **Fix:** Define a single shared validation function used by both the Zod schema and the execution layer.

### A5-3: `createApiHandler` generic 500 error (deferred) [LOW]

- **File:** `src/lib/api/handler.ts:204-207`
- **Confidence:** Medium
- **Description:** Already deferred from cycle 1. `createApiHandler` catches all errors and returns a generic 500 with `{ error: "internalServerError" }`. It does not distinguish between validation errors (400), auth errors (401/403), and genuine server errors (500). Callers cannot provide structured error responses without bypassing the wrapper.
- **Fix:** Allow handlers to throw structured errors (e.g., `ApiError` class with status code) that the wrapper propagates without wrapping in 500.

## Summary

3 findings: 1 MEDIUM, 2 LOW (1 deferred). No new structural coupling found.
