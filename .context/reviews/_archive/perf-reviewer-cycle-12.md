# Performance Reviewer — Cycle 12 Deep Review

**Date:** 2026-04-24
**Reviewer:** perf-reviewer
**Scope:** Database queries, in-memory data structures, concurrency, CPU/memory usage

## Findings

### PR12-1: In-memory rate limiter FIFO eviction is O(n log n) under overflow

**File:** `src/lib/security/in-memory-rate-limit.ts:41-46`
**Severity:** MEDIUM / Confidence: HIGH

When `store.size > MAX_ENTRIES` (10,000), the eviction code creates a full copy of the Map entries and sorts them: `const sorted = [...store.entries()].sort(...)`. This is O(n log n) on a hot path. Under sustained load, this triggers GC pressure from the temporary array allocation and blocks the event loop during the sort.

**Fix:** Replace with a LinkedHashMap-style approach or maintain a separate sorted index. Alternatively, reduce `MAX_ENTRIES` and accept faster eviction, or use a priority queue.

### PR12-2: SSE connection cleanup iterates all entries with linear scan for oldest

**File:** `src/app/api/v1/submissions/[id]/events/route.ts:44-55`
**Severity:** LOW / Confidence: HIGH

The `addConnection` function, when `connectionInfoMap.size >= MAX_TRACKED_CONNECTIONS`, iterates all entries to find the oldest: `for (const [key, info] of connectionInfoMap) { if (info.createdAt < oldestTime) ... }`. With `MAX_TRACKED_CONNECTIONS = 1000`, this is O(n) per eviction. Under high connection churn, this adds latency.

**Fix:** Maintain a min-heap or sorted structure indexed by `createdAt` for O(log n) eviction.

### PR12-3: `sharedPollTick` fetches all subscriber submission IDs in single query but does not batch-size limit

**File:** `src/app/api/v1/submissions/[id]/events/route.ts:172-203`
**Severity:** LOW / Confidence: MEDIUM

`sharedPollTick` collects all submission IDs from `submissionSubscribers` and queries them with `inArray(submissions.id, submissionIds)`. If there are hundreds of active SSE connections watching different submissions, the `IN (...)` clause can grow very large. PostgreSQL handles this efficiently for small lists, but very large IN clauses (>1000) can degrade query planning.

**Fix:** Add a chunking limit — split `submissionIds` into batches of ~500 and union the results. Or add a cap on the total number of tracked subscriptions.

### PR12-4: `getTrustedAuthHosts()` queries DB on every call without caching

**File:** `src/lib/security/env.ts:111-139`
**Severity:** LOW / Confidence: MEDIUM

`getTrustedAuthHosts()` calls `getAllowedHostsFromDb()` which imports and queries `systemSettings` on every invocation. This is called from `isTrustedServerActionOrigin()` which runs on every server action call. With many concurrent server action invocations, this creates unnecessary DB load.

**Fix:** Cache the trusted hosts set with a TTL (e.g., 5 minutes) similar to how `cachedStaleThreshold` works in the SSE route.

## Verified Performance Patterns

- Docker execution properly uses `pLimit` for concurrency control
- Rate limit eviction runs on a 60-second timer, not on every request — good
- SSE shared polling reduces per-connection DB queries to one batch query — good
- Drizzle ORM queries use `.columns()` to select only needed fields — good
- DB export uses streaming with backpressure (`waitForReadableStreamDemand`) — good
