# Debugger

**Date:** 2026-04-19
**Base commit:** b91dac5b
**Angle:** Latent bug surface, failure modes, regressions

---

## F1: Tags API `limit` NaN produces undefined query behavior

- **File**: `src/app/api/v1/tags/route.ts:17`
- **Severity**: MEDIUM
- **Confidence**: HIGH
- **Description**: Same finding as code-reviewer F1. `Number("abc")` produces `NaN`, and `Math.min(NaN, 100)` is `NaN`. Passing `NaN` to Drizzle's `.limit()` produces undefined behavior — it may be treated as 0, cause a SQL error, or be silently ignored depending on the driver version. This is the same bug class as the anti-cheat endpoint, which was fixed in cycle 21 but the tags endpoint was not.
- **Concrete failure scenario**: A malformed `?limit=abc` request causes the tags endpoint to return 0 results or a SQL error. Users see an empty tag list.
- **Fix**: Change to `parseInt` with fallback, matching the anti-cheat endpoint fix.

## F2: SSE connection tracking map eviction removes oldest entry by insertion order — may evict active connections

- **File**: `src/app/api/v1/submissions/[id]/events/route.ts:41-44`
- **Severity**: LOW
- **Confidence**: MEDIUM
- **Description**: When `connectionInfoMap` reaches `MAX_TRACKED_CONNECTIONS` (1000), `addConnection` evicts the oldest entry by Map insertion order (FIFO). However, the oldest entry may still be an active connection — the eviction is based on tracking capacity, not connection staleness. The `activeConnectionSet` and `userConnectionCounts` are updated on eviction, which means a still-active connection would lose its tracking entry and the per-user count would be decremented. This could allow a user to exceed `maxSseConnectionsPerUser` because their count was decremented by the eviction of a still-active connection.
- **Concrete failure scenario**: User A has 3 SSE connections (at the per-user limit of 3). The tracking map reaches capacity and evicts User A's oldest entry. User A's per-user count drops to 2. User A opens a 4th connection, which is allowed because the count is now 2 instead of 3. The actual per-user connection count is 4, exceeding the limit.
- **Fix**: Before evicting, check if the connection is still active (e.g., by checking if the connection ID is still in `activeConnectionSet`). If so, skip eviction or evict a different entry. Alternatively, increase `MAX_TRACKED_CONNECTIONS` to be significantly larger than `MAX_GLOBAL_SSE_CONNECTIONS` (currently it's 2x, which may not be enough under heavy load).

## Previously Verified Safe (Prior Cycles)

- Anti-cheat `limit`/`offset` NaN — fixed in cycle 21
- `computeSingleUserLiveRank` late penalty — fixed in cycle 20
- ICPC last-AC-time tiebreaker — deferred (cycle 21 L6)
