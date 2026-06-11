# Performance Review — Cycle 39

**Date:** 2026-04-23
**Reviewer:** perf-reviewer
**Base commit:** c176d8f5

## PERF-1: SSE connection tracking eviction scans entire Map for oldest entry [LOW/LOW]

**File:** `src/app/api/v1/submissions/[id]/events/route.ts:44-55`

**Description:** When `connectionInfoMap.size >= MAX_TRACKED_CONNECTIONS`, the eviction loop scans all entries to find the oldest one. With `MAX_GLOBAL_SSE_CONNECTIONS = 500`, `MAX_TRACKED_CONNECTIONS = 1000`. In the worst case, this is O(1000) per new connection. This is already noted in prior deferrals.

**Confidence:** Low (already deferred; bounded by cap)

---

## PERF-2: Anti-cheat GET endpoint runs two separate queries when `userIdFilter` is provided [MEDIUM/MEDIUM]

**File:** `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:163-224`

**Description:** When a `userId` filter is present and anti-cheat is enabled, the GET handler executes: (1) the paginated events query, (2) the total count query, and (3) the heartbeat gap detection query that fetches up to 5000 heartbeat rows sorted in DESC order, then reverses them in JS. For long contests, this third query can be expensive and returns up to 5000 rows.

**Concrete failure scenario:** An instructor views anti-cheat details for a student in a 48-hour contest. The heartbeat gap query fetches 2880 rows (48h * 60/min = 2880 heartbeats at 60s intervals). This is well within the 5000 limit but still a significant data transfer.

**Fix:** Consider computing heartbeat gaps only when explicitly requested (e.g., a query param `includeGaps=true`) or using a window function in SQL to detect gaps without transferring all rows to the application layer.

**Confidence:** Medium (bounded by limit, but unnecessary data transfer for common case)

---

## PERF-3: Shared poll timer reads config on every restart [LOW/LOW]

**File:** `src/app/api/v1/submissions/[id]/events/route.ts:160-170`

**Description:** When `startSharedPollTimer()` is called, it reads `getConfiguredSettings().ssePollIntervalMs` to determine the interval. This is already noted in prior deferrals.

**Confidence:** Low (already deferred)

---

## No New Performance Issues This Cycle

The codebase shows good performance patterns overall. The recent changes (computeExpiryFromDays extraction, bulk route case-insensitive fix) are all O(1) operations with no performance regressions.
