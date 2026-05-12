# Architecture Review — Cycle 8/100

**Date:** 2026-05-11
**HEAD:** main / 05752cdb
**Reviewer:** architect

---

## Findings

### A1 — MEDIUM — `rateLimits` table remains overloaded for three concerns

- **File:** `src/lib/realtime/realtime-coordination.ts`
- **Description:** The `rateLimits` table is used for (1) API rate limiting, (2) SSE connection slot tracking, and (3) heartbeat deduplication. These are semantically different concerns. The table schema has fields like `attempts`, `consecutiveBlocks`, and `blockedUntil` which make sense for rate limiting but are meaningless for SSE slots. This was deferred in cycle 7.
- **Confidence:** HIGH
- **Suggested fix:** Create separate tables for SSE connection slots and heartbeat tracking, or add a `category` column with stricter validation.

### A2 — LOW — `stopSharedPollTimer` does not await in-flight promises

- **File:** `src/app/api/v1/submissions/[id]/events/route.ts:161-166`
- **Description:** `stopSharedPollTimer()` clears the interval timer but does not wait for an in-flight `sharedPollTick()` promise to complete. During graceful shutdown, if `stopSharedPollTimer` is called while `sharedPollTick` is awaiting its DB query, the DB connection may be released mid-query. This was deferred in cycle 7.
- **Confidence:** MEDIUM

### A3 — LOW — Contest layouts contain Next.js workaround with TODO

- **Files:** `src/app/(public)/contests/manage/layout.tsx`, `src/app/(public)/contests/[id]/layout.tsx`
- **Description:** Both files contain identical workarounds for a Next.js 16 RSC streaming bug behind proxies. The workaround adds click listeners to intercept navigation for links with `data-full-navigate`. The TODO comments reference upstream issue #76472 and state to remove when Next.js >= 16.3.
- **Confidence:** HIGH
- **Suggested fix:** Monitor upstream issue and remove workaround when fixed.

### A4 — LOW — `node-shutdown.ts` SIGTERM handler calls `process.exit`

- **File:** `src/lib/audit/node-shutdown.ts:37-43`
- **Description:** The SIGTERM handler flushes the audit buffer and then calls `processLike.exit(0)`. This prevents Node.js from running its default shutdown behavior (waiting for event loop to drain). In-flight HTTP requests may be terminated abruptly.
- **Confidence:** LOW
- **Suggested fix:** Let Node.js exit naturally after flushing; do not call `process.exit()` explicitly unless there is a hung process.

---

## Verified Fixes from Prior Cycles

- Cycle 7 Task 1 (playground platform mode): correctly isolates platform mode check
- Cycle 7 Task 2 (getDbNowUncached out of lock): correctly reduces lock contention
