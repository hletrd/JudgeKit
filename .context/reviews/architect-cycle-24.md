# Architect — Cycle 24

**Date:** 2026-04-24
**Reviewer:** architect
**Scope:** Architecture, design risks, coupling, layering, system boundaries

---

## Findings

### A-1: [MEDIUM] `rateLimits` Table Overloaded for Realtime Coordination — Schema Coupling Risk

**Confidence:** HIGH
**Citations:** `src/lib/realtime/realtime-coordination.ts:75-136`, `src/lib/db/schema.pg.ts` (rateLimits table)

The `rateLimits` table is used for three distinct purposes:
1. Rate limiting (its original purpose)
2. SSE connection tracking (realtime coordination)
3. Anti-cheat heartbeat dedup (shared heartbeat recording)

All three use cases share the same schema fields (`key`, `attempts`, `windowStartedAt`, `blockedUntil`, `consecutiveBlocks`, `lastAttempt`, `createdAt`), but the semantics of these fields differ by use case:
- For rate limiting, `blockedUntil` means "rate limit window expires at"
- For SSE connections, `blockedUntil` means "connection timeout expires at"
- For heartbeats, `blockedUntil` means "heartbeat interval expires at"

This coupling means:
- Adding a field for one use case affects all three
- Querying SSE connections requires `LIKE` patterns on the key prefix (inefficient for large tables)
- The `attempts` and `consecutiveBlocks` columns are meaningless for SSE/heartbeat entries but must be populated
- The advisory lock key for SSE acquisition (`"realtime:sse:acquire"`) serializes all SSE connection acquisitions globally

**Concrete failure scenario:** During a high-traffic contest, 200 students connect to SSE simultaneously. Each `acquireSharedSseConnectionSlot` call acquires a global advisory lock, serializing all connection setups. This creates a bottleneck, causing connection setup latency to grow linearly with concurrent connections.

**Fix:** Long-term: separate the SSE connection and heartbeat dedup into a dedicated table (e.g., `sse_connections`, `anti_cheat_heartbeats`) with proper indexes. Short-term: this is a DRY/schemacoupling concern that does not cause data corruption — defer until performance becomes an issue.

---

### A-2: [LOW] Proxy Auth Cache FIFO Eviction May Evict Hot Entries Under Token Rotation

**Confidence:** MEDIUM
**Citations:** `src/proxy.ts:64-85`

The proxy auth cache uses FIFO eviction (delete the oldest inserted entry). When the cache reaches capacity, the first-inserted entry is evicted regardless of how recently it was accessed. JWT token rotation creates new cache keys every `sessionMaxAge` seconds, leaving orphaned entries for expired tokens.

The cleanup logic (lines 71-78) removes expired entries when the cache is at 90% capacity. However, under sustained load with many active sessions, hot entries (frequently accessed users) may be evicted in favor of cold entries (recently rotated but not yet re-accessed tokens).

**Concrete failure scenario:** 500 unique active users (cache max = 500). A few users' tokens rotate, creating new entries. The cache reaches 500, and the FIFO eviction removes the oldest entry — which may be the most active user's original entry, now replaced by their rotated token entry. This causes a one-time DB query to re-fetch the user on the next request.

**Fix:** Consider LRU eviction instead of FIFO. However, the current 2-second TTL means evicted entries are quickly re-populated, making this a minor concern.

---

## Files Reviewed

- `src/lib/realtime/realtime-coordination.ts` (full)
- `src/proxy.ts` (full)
- `src/lib/api/handler.ts` (full)
- `src/lib/db/queries.ts` (full)
- `src/lib/assignments/contest-scoring.ts` (full)
- `src/lib/assignments/leaderboard.ts` (full)
- `src/app/api/v1/submissions/[id]/events/route.ts` (full)
