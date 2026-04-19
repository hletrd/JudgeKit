# Performance Reviewer

**Date:** 2026-04-19
**Base commit:** b91dac5b
**Angle:** Performance, concurrency, CPU/memory/UI responsiveness

---

## F1: SSE route connection cleanup timer uses `setInterval` with synchronous `Map` iteration

- **File**: `src/app/api/v1/submissions/[id]/events/route.ts:72-84`
- **Severity**: LOW
- **Confidence**: MEDIUM
- **Description**: The cleanup timer iterates over `connectionInfoMap` every 60 seconds. For a map with 500+ entries (the `MAX_TRACKED_CONNECTIONS` is 1000), this is a synchronous operation on the main thread. While individual Map iterations are fast (O(n)), the `removeConnection` function modifies `userConnectionCounts` and `activeConnectionSet` during iteration, which could cause brief pauses in the event loop under high connection counts.
- **Concrete failure scenario**: During a contest with 500+ simultaneous SSE connections, the cleanup timer iterates over all entries and calls `removeConnection` for stale ones. This is a brief synchronous operation that could cause a few milliseconds of event loop blocking.
- **Fix**: The impact is minimal (Map operations are very fast even for 1000 entries). No immediate action needed. If connection counts grow significantly, consider batching the cleanup.

## F2: `sanitizeSubmissionForViewer` hidden DB query adds latency per submission

- **File**: `src/lib/submissions/visibility.ts:74`
- **Severity**: MEDIUM
- **Confidence**: HIGH
- **Description**: Same finding as code-reviewer F3 but from a performance angle. `sanitizeSubmissionForViewer` queries the `assignments` table for every invocation. This adds ~5-15ms of DB latency per submission view. For the SSE route, this is called once per final-result event, so the overhead is acceptable. But the function's signature hides this cost.
- **Concrete failure scenario**: A developer adds a "submissions history" endpoint that returns 50 submissions and calls `sanitizeSubmissionForViewer` for each. The endpoint takes 250-750ms longer than expected due to 50 sequential DB queries.
- **Fix**: Accept assignment visibility settings as optional parameters to allow callers to skip the DB query.

## F3: Chat widget streaming responses hold DB connection during entire stream duration

- **File**: `src/app/api/v1/plugins/chat-widget/chat/route.ts:338-369`
- **Severity**: LOW
- **Confidence**: LOW
- **Description**: The chat widget persists messages in a `finally` block after the stream completes. The DB connection is held only during the insert, not during the stream. However, if the stream takes a long time (e.g., 30+ seconds for a complex tool-calling loop), the `agentContext` closure retains references to the request context, which may prevent garbage collection of the request object.
- **Concrete failure scenario**: A chat request with tool calling takes 25 seconds. During this time, the request object is retained in memory via the `agentContext` closure. This is a minor memory concern, not a correctness issue.
- **Fix**: No immediate action needed. The memory impact is small per request.

## Previously Verified Safe (Prior Cycles)

- `participant-audit.ts` full leaderboard computation — documented, optimization deferred
- Contest-scoring single-instance LRU cache — mitigated by 30s TTL
- Anti-cheat heartbeat gap detection — deferred to L4
- Independent DB queries in `contest-analytics.ts` — parallelized in cycle 21 (commit ab8fe63b)
