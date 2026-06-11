# Cycle 13 Performance Reviewer Report

**Date:** 2026-04-19
**Base commit:** e8340da5
**Reviewer angle:** Performance, concurrency, CPU/memory/UI responsiveness

---

## CR13-PR1 — [MEDIUM] Dashboard layout still makes 5+ DB/IO queries per navigation — no caching

- **File:** `src/app/(dashboard)/layout.tsx:33-61`
- **Confidence:** MEDIUM
- **Evidence:** This is the same issue as AGG-5 from cycle 12. The layout calls `resolveCapabilities`, `isPluginEnabled`, `isAiAssistantEnabled`, `getResolvedSystemSettings`, `isInstructorOrAboveAsync`, `getActiveTimedAssignmentsForSidebar` on every dashboard page navigation. The `resolveCapabilities` function now has a 60-second TTL cache (in `capabilities/cache.ts`), so it's not a fresh DB hit every time. However, the other calls (`isPluginEnabled`, `isAiAssistantEnabled`, `getResolvedSystemSettings`) are still uncached. System settings rarely change and plugin status is even more static.
- **Suggested fix:** (Carried from D7) Cache plugin status and system settings with short TTLs. This overlaps with D2 (JWT callback cache).

## CR13-PR2 — [LOW] SSE connection tracking eviction uses O(n) linear scan

- **File:** `src/app/api/v1/submissions/[id]/events/route.ts:44-55`
- **Confidence:** LOW
- **Evidence:** The eviction loop in `addConnection` iterates all entries in `connectionInfoMap` to find the oldest. With `MAX_TRACKED_CONNECTIONS = 1000`, this is at most 1000 iterations, which is fast. But under heavy load with many concurrent connections, this could become noticeable.
- **Suggested fix:** Use a min-heap or sorted structure for O(log n) eviction. Low priority given the 1000-entry cap.

## CR13-PR3 — [LOW] Public layout queries `resolveCapabilities` on every page load even for unauthenticated users

- **File:** `src/app/(public)/layout.tsx:17`
- **Confidence:** LOW
- **Evidence:** `const capabilities = session?.user ? [...await resolveCapabilities(session.user.role)] : undefined;` — for unauthenticated users this is a no-op (short-circuits to undefined). For authenticated users, it calls `resolveCapabilities` which has the 60s TTL cache. The spread `[...]` converts Set to array, which is fine for ~20 capabilities. No real performance concern here.

---

## Final Sweep

- The `capabilities/cache.ts` module has a proper 60-second TTL with deduplication of concurrent loads. This is a significant improvement over the previous un-cached state.
- SSE shared polling is efficient — one timer queries all active submissions in a single batch.
- Rate limit eviction runs on a 60-second interval timer with `unref()` to avoid blocking process exit.
- Export streaming uses backpressure-aware `waitForReadableStreamDemand` with 50ms polling.
