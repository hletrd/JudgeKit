# Tracer — Cycle 23

**Date:** 2026-04-24
**Scope:** Causal tracing of suspicious flows

---

## TR-1: [MEDIUM] SSE connection leak when `addConnection` succeeds but the SSE stream creation fails

**Confidence:** MEDIUM
**Citations:** `src/app/api/v1/submissions/[id]/events/route.ts:246-254,302-466`

**Trace:** 
1. Request arrives, user is authenticated (line 213).
2. Connection slot is acquired: `addConnection(connId, userId)` at line 253.
3. Submission is fetched (line 258). If the submission query throws, or if the `ReadableStream` constructor throws, the catch at line 467 logs the error and returns a 500.
4. However, `removeConnection(connId)` is NOT called in this error path. The connection tracking entry persists forever (until the cleanup timer evicts it as stale).
5. Over time, leaked entries accumulate, potentially hitting `MAX_TRACKED_CONNECTIONS` and causing unnecessary evictions, or worse, inflating `userConnectionCounts` so legitimate new connections are rejected with "tooManyConnections".

Wait — looking more carefully at the code flow: lines 246-254 are in the `else` branch (non-shared coordination). After `addConnection`, the code proceeds to fetch the submission (line 258). If that fetch fails, we fall to the outer try/catch at line 467. The catch does NOT clean up the connection.

But for the `useSharedCoordination` path (line 236), the release IS handled in the 404/403 early returns (lines 269, 276). However, there is no cleanup in the outer catch.

**Concrete failure scenario:** DB query at line 258 throws an intermittent connection error. The connection slot is leaked. Over a period of hours, these leaks accumulate. A user who repeatedly triggers this error can eventually hit `maxSseConnectionsPerUser` and be permanently locked out of SSE connections until the cleanup timer evicts stale entries (up to 30 minutes + 30s).

**Fix:** Add `removeConnection(connId)` or `releaseSharedSseConnectionSlot(sharedConnectionKey)` in the outer catch block at line 467, based on the `useSharedCoordination` flag.

---

## TR-2: [LOW] Contest ranking background refresh error silently swallowed

**Confidence:** LOW
**Citations:** `src/lib/assignments/contest-scoring.ts:117-119`

The background refresh `.catch()` handler logs a generic error message without the actual error object or the `assignmentId`. The log message is: `"[contest-scoring] Failed to refresh ranking cache"` — no error details, no assignment context.

**Fix:** Include `{ err, assignmentId }` in the logger call and include the actual error for debugging.

---

## Summary

- Total findings: 2
- MEDIUM: 1 (TR-1)
- LOW: 1 (TR-2)
