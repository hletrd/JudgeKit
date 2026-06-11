# Performance Reviewer — Cycle 26

**Date:** 2026-04-25
**Scope:** Performance, concurrency, CPU/memory

---

## P-1: [LOW] SSE stale connection cleanup uses O(n) linear scan

**File:** `src/app/api/v1/submissions/[id]/events/route.ts:44-53, 116-124`
**Confidence:** LOW

The `addConnection` function evicts the oldest entry by iterating over the entire `connectionInfoMap` when the tracking cap is reached. Similarly, the periodic cleanup iterates all entries to find stale ones. With `MAX_TRACKED_CONNECTIONS = 1000`, this is acceptable. However, under very high connection churn, this O(n) scan per eviction could add latency. A sorted data structure (e.g., a min-heap by `createdAt`) would reduce this to O(log n), but is not needed at current scale.

---

## P-2: [LOW] In-memory rate limiter eviction is O(n) with global lock

**File:** `src/lib/security/in-memory-rate-limit.ts:23-51`
**Confidence:** LOW

The `maybeEvict` function iterates the entire `store` Map every 60 seconds. With `MAX_ENTRIES = 10000`, this is fine. The two-pass eviction (expired first, then FIFO) is well-designed. No action needed at current scale.

---

## Positive performance observations

- Contest ranking uses LRU cache with stale-while-revalidate pattern to avoid blocking requests on DB queries
- Code similarity check uses time-based yielding to keep the event loop responsive during O(n^2) comparisons
- Data retention uses batched DELETEs (BATCH_SIZE = 5000) with inter-batch delays to avoid long-running locks and WAL bloat
- SSE shared polling uses a single interval that batches all active submission queries into one DB call
- `pLimit(2)` in contest replay bounds concurrent DB queries to 6 (2 snapshots * 3 queries each)
