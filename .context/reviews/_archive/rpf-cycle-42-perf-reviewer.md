# RPF Cycle 42 — Performance Reviewer

**Date:** 2026-04-23
**Base commit:** 8912b987
**Reviewer angle:** Performance, concurrency, CPU/memory/UI responsiveness

## Findings

### PERF-1: SSE connection eviction scans all entries to find oldest [LOW/LOW]

**File:** `src/app/api/v1/submissions/[id]/events/route.ts:44-55`

**Description:** When the `connectionInfoMap` exceeds `MAX_TRACKED_CONNECTIONS` (1000), the eviction loop scans all entries to find the one with the lowest `createdAt`. This is O(n) per eviction. With 1000 entries and multiple concurrent connection attempts, this could cause brief latency spikes. However, the cap is bounded at 1000 and the scan is in-memory, making this acceptable for current scale.

**Concrete failure scenario:** During a burst of 50+ simultaneous SSE connections when the map is near capacity, each `addConnection` call scans ~1000 entries. The combined CPU cost is ~50,000 comparisons, which is negligible.

**Fix:** If scale increases significantly, replace with a min-heap or sorted data structure. Currently not warranted.

**Confidence:** Low (bounded, in-memory, acceptable at current scale)

---

### PERF-2: Analytics stale-while-revalidate background refresh uses unawaited promise [LOW/LOW]

**File:** `src/app/api/v1/contests/[assignmentId]/analytics/route.ts:65-76`

**Description:** The background refresh for stale analytics data uses `.then()/.catch()/.finally()` without awaiting the result. This is intentional (stale-while-revalidate pattern), but the `_refreshingKeys` set is only cleared in `.finally()`. If `computeContestAnalytics` throws synchronously before the promise chain starts, the key would remain in the set permanently, blocking future refreshes for that cache key. However, since `computeContestAnalytics` is async, this is unlikely.

**Concrete failure scenario:** A synchronous error in `computeContestAnalytics` (e.g., invalid import) causes the promise to reject before `.catch()` attaches. The `_refreshingKeys` entry is never cleared, blocking all future background refreshes for that assignment.

**Fix:** Wrap in `void (async () => { ... })()` pattern for guaranteed error handling, or ensure the promise chain starts immediately.

**Confidence:** Low (async function makes this theoretical)

---

## Carry-Over Items (Still Unfixed)

- Prior PERF-3: Anti-cheat heartbeat gap query transfers up to 5000 rows (deferred, MEDIUM/MEDIUM)
- Prior AGG-6: SSE O(n) eviction scan (deferred, LOW/LOW)

## Sweep: Files Reviewed

- `src/app/api/v1/submissions/[id]/events/route.ts`
- `src/app/api/v1/contests/[assignmentId]/analytics/route.ts`
- `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts`
- `src/lib/realtime/realtime-coordination.ts`
- `src/lib/audit/events.ts`
- `src/lib/compiler/execute.ts`
- `src/lib/security/rate-limit.ts`
- `src/components/exam/anti-cheat-monitor.tsx`
- `src/components/exam/countdown-timer.tsx`
- `src/components/problem/problem-submission-form.tsx`
