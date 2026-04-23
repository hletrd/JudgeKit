# RPF Cycle 11 — Performance Reviewer

**Date:** 2026-04-20
**Base commit:** 74353547

## Findings

### PERF-1: `getDbNowUncached()` called multiple times per transaction in recruiting token path [LOW/MEDIUM]

**File:** `src/lib/assignments/recruiting-invitations.ts:361`
**Description:** In the recruiting token's "already redeemed" path, `getDbNowUncached()` is called at line 361 for `tokenInvalidatedAt`. Each call is a separate `SELECT NOW()` query to the database. While the function itself is fast (~1ms), calling it multiple times within a single transaction is wasteful — the DB time is effectively constant within a transaction. The existing code at line 361 already calls `getDbNowUncached()` once. If the 7 `new Date()` calls are replaced with DB time (per CR-1/SEC-1), the same `dbNow` value should be fetched once and reused across the entire transaction to avoid unnecessary round-trips.
**Confidence:** MEDIUM
**Fix:** Fetch `const dbNow = await getDbNowUncached()` once at the start of the transaction and reuse for all timestamp fields.

### PERF-2: SSE connection tracking eviction uses O(n) scan for oldest entry [LOW/LOW]

**File:** `src/app/api/v1/submissions/[id]/events/route.ts:44-55`
**Description:** When `connectionInfoMap.size >= MAX_TRACKED_CONNECTIONS`, the eviction loop scans all entries to find the oldest one by `createdAt`. With `MAX_TRACKED_CONNECTIONS = 1000`, this is a linear scan of up to 1000 entries. However, this only triggers when the tracking cap is hit, which is an edge case. The stale cleanup timer also helps keep the map small.
**Confidence:** LOW
**Fix:** Could use a MinHeap or sorted structure, but the impact is negligible for the expected scale.

### Verified Safe

- Rate limit eviction runs on a 60-second interval, not on every request.
- Audit buffer flushes in batches of 50 with a 5-second timer — good throughput.
- Data retention pruning uses batched deletes with 5000-row batches and 100ms delays.
- SSE shared polling uses a single batch query for all active submission IDs.
- Database export streams in chunks of 1000 rows with backpressure support.
