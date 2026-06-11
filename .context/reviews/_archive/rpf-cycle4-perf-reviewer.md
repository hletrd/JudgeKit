# Performance Review — RPF Cycle 4 (Loop 4/100)

**Date:** 2026-04-24
**Reviewer:** perf-reviewer
**Base commit:** a717b371

## Inventory of Reviewed Files

- `src/lib/security/api-rate-limit.ts` (full)
- `src/lib/security/rate-limit.ts` (full)
- `src/lib/security/in-memory-rate-limit.ts` (full)
- `src/lib/security/rate-limiter-client.ts` (full)
- `src/lib/realtime/realtime-coordination.ts` (full)
- `src/lib/assignments/contest-scoring.ts` (full — stale-while-revalidate pattern)
- `src/lib/assignments/leaderboard.ts` (full)
- `src/app/api/v1/submissions/[id]/events/route.ts` (full — SSE connection tracking)
- `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts` (full — heartbeat gap query)
- `src/app/api/v1/contests/[assignmentId]/analytics/route.ts` (full — stale-while-revalidate)
- `src/proxy.ts` (full — auth cache)
- `src/lib/db/queries.ts` (full — named parameter conversion)
- `src/lib/capabilities/cache.ts` (referenced)

## Findings

### PERF-1: SSE connection tracking O(n) eviction scan [LOW/LOW — carry-over, confirmed unchanged]

**File:** `src/app/api/v1/submissions/[id]/events/route.ts:44-55`

**Description:** The `addConnection` function iterates over all entries in `connectionInfoMap` to find the oldest when the map exceeds `MAX_TRACKED_CONNECTIONS`. This is O(n) per eviction. The `userConnectionCounts` map was previously added (cycle 47) to make per-user count lookups O(1), which addresses the hot-path concern. The eviction itself is rare (only when at capacity) and bounded at 1000 entries.

**Status:** Carry-over. No change needed this cycle.

---

### PERF-2: Anti-cheat heartbeat gap query transfers up to 5000 rows [MEDIUM/MEDIUM — carry-over]

**File:** `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:195-204`

**Description:** Known carry-over. The query fetches up to 5000 heartbeat rows in DESC order, then reverses them in JS for gap detection. A SQL window function would be more efficient. Currently functional.

**Status:** Carry-over.

---

### PERF-3: Stale-while-revalidate pattern duplication [LOW/LOW — carry-over]

**Files:** `src/lib/assignments/contest-scoring.ts`, `src/app/api/v1/contests/[assignmentId]/analytics/route.ts`

**Description:** The same stale-while-revalidate cache pattern is duplicated across these files. A shared utility would reduce code duplication.

**Status:** Carry-over.

---

## New Findings

**No new performance findings this cycle.** The codebase has not changed since cycle 3. All prior performance findings remain valid and tracked as deferred items.
