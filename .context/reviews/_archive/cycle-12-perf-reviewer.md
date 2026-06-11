# Cycle 12 — Performance Reviewer

**Date:** 2026-04-19
**Base commit:** 2339c7ea

## Findings

### CR12-PR1 — [MEDIUM] Dashboard layout performs 5+ DB/IO queries per navigation — no caching for capabilities or settings

- **File:** `src/app/(dashboard)/layout.tsx:34-62`
- **Confidence:** HIGH
- **Evidence:** The layout calls: `getRecruitingAccessContext`, `getTranslations`, `resolveCapabilities`, `isPluginEnabled`, `isAiAssistantEnabled`, `getResolvedSystemSettings`, `isInstructorOrAboveAsync`, `getActiveTimedAssignmentsForSidebar`. Capabilities are resolved per-role and never change between requests for the same role. System settings rarely change. These could be cached with short TTLs.
  - `resolveCapabilities` queries the DB for role-capability mappings on every request.
  - `isPluginEnabled` and `isAiAssistantEnabled` query settings on every request.
  - `getResolvedSystemSettings` reads from a config cache but still creates objects.
- **Suggested fix:** Cache `resolveCapabilities` results per role with a 60s TTL. Cache plugin/AI status with a 30s TTL.

### CR12-PR2 — [LOW] SSE connection tracking uses O(n) scan for oldest-by-age eviction

- **File:** `src/app/api/v1/submissions/[id]/events/route.ts:44-55`
- **Confidence:** MEDIUM
- **Evidence:** When `connectionInfoMap.size >= MAX_TRACKED_CONNECTIONS`, the code iterates all entries to find the oldest. With MAX_TRACKED_CONNECTIONS = 1000, this is a 1000-entry linear scan on every new connection. The cleanup timer (line 82-91) also iterates all entries every 60s.
- **Suggested fix:** Use a sorted data structure (e.g., a min-heap by createdAt) or accept the O(n) cost since it only triggers at capacity.

### CR12-PR3 — [LOW] `buildImportColumnSets` runs at module load time — scans all table columns

- **File:** `src/lib/db/import.ts:57-87`
- **Confidence:** LOW
- **Evidence:** The `buildImportColumnSets` function iterates all tables and their columns at module import time. This is a one-time cost and the result is cached, but it adds to cold-start latency. The function also creates three Sets (timestampColumns, booleanColumns, jsonColumns) that are used for column name lookups — these could be pre-computed at build time.
- **Suggested fix:** Low priority. Accept the one-time cost.

### CR12-PR4 — [MEDIUM] Rate limit `SELECT FOR UPDATE` creates row-level lock contention under high concurrency

- **File:** `src/lib/security/rate-limit.ts:83`, `src/lib/security/api-rate-limit.ts:67`
- **Confidence:** MEDIUM
- **Evidence:** Both login rate limiting and API rate limiting use `SELECT FOR UPDATE` to prevent TOCTOU races. Under high concurrency (many simultaneous login attempts from different IPs), each transaction acquires a row lock on the `rateLimits` table. While different keys use different rows, the overall table can experience lock contention. The sidecar (rate-limiter-rs) mitigates this for API endpoints, but login rate limiting still goes directly to the DB.
- **Suggested fix:** Consider using the sidecar for login rate limiting as well, or use an upsert pattern instead of SELECT FOR UPDATE + INSERT/UPDATE.

## Previously Deferred Items Still Valid

- D2/D3: JWT callback DB query on every request (MEDIUM)
