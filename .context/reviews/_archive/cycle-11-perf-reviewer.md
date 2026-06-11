# Cycle 11 Performance Reviewer Report

**Reviewer:** perf-reviewer
**Date:** 2026-04-19
**Base commit:** 6c99b15c
**Scope:** Performance, concurrency, CPU/memory/UI responsiveness

## Inventory of Files Reviewed

- `src/lib/auth/config.ts` — JWT callback with per-request DB query
- `src/lib/db/export.ts` — Streaming export with backpressure handling
- `src/lib/compiler/execute.ts` — Docker execution with concurrency limiter
- `src/lib/realtime/realtime-coordination.ts` — SSE connection coordination
- `src/app/api/v1/submissions/[id]/events/route.ts` — SSE polling (475 lines)
- `src/app/api/v1/submissions/route.ts` — Submissions with cursor/offset pagination
- `src/lib/security/rate-limit.ts` — Rate limiting
- `src/lib/security/api-rate-limit.ts` — Two-tier API rate limiting
- `src/lib/capabilities/cache.ts` — Capability resolution cache
- `src/proxy.ts` — Edge middleware with auth cache

## Findings

### CR11-PR1 — [MEDIUM] JWT callback DB query on every request — no TTL cache (deferred D3)

- **Confidence:** HIGH
- **Cross-agent agreement:** cycle-10 perf-reviewer CR10-PR1
- **File:** `src/lib/auth/config.ts:448-452`
- **Evidence:** The `jwt()` callback queries `db.query.users.findFirst` on every authenticated request. With session strategy "jwt", this fires on every authenticated API call and page load. The proxy middleware (`src/proxy.ts`) already has a 2-second TTL cache for auth lookups (`AUTH_CACHE_TTL_MS`), but the `jwt` callback does not share this cache. The `jwt` callback runs AFTER the proxy middleware, so each request results in two DB queries for auth: one in the proxy and one in the jwt callback.
- **Failure scenario:** At moderate traffic (100 req/s), the `jwt` callback alone generates 100 DB queries/s for auth refresh. The proxy adds another ~50 queries/s (with 2s TTL cache). Total: ~150 auth queries/s, which saturates a 10-connection pool.
- **Suggested fix:** Add a short TTL cache (5-10s) keyed by userId inside the jwt callback, or share the proxy's auth cache. This preserves security (role/active status updates propagate within 5-10s) while reducing DB load by ~90%.

### CR11-PR2 — [MEDIUM] SSE route has duplicated terminal-result-fetch logic — potential concurrent double-query

- **Confidence:** MEDIUM
- **Cross-agent agreement:** cycle-10 perf-reviewer CR10-PR2
- **File:** `src/app/api/v1/submissions/[id]/events/route.ts:346-366, 389-410`
- **Evidence:** The `onPollResult` callback has two paths that fetch the full submission on terminal status. Both paths call `queryFullSubmission(id)` which does a DB query with joins. If the poll tick fires while a previous terminal-result-fetch is still in flight (possible if the poll interval is very short), the same query could run concurrently.
- **Suggested fix:** Extract the terminal-result-fetch logic into a shared helper function with a guard against concurrent fetches (e.g., a `fetchInProgress` boolean).

### CR11-PR3 — [LOW] SSE connection eviction scan is O(n) per eviction — should use a min-heap or sorted structure

- **Confidence:** LOW
- **File:** `src/app/api/v1/submissions/[id]/events/route.ts:44-54`
- **Evidence:** The eviction loop iterates the entire `connectionInfoMap` to find the oldest entry. With `MAX_TRACKED_CONNECTIONS = 1000`, this is at most 1000 iterations — negligible for a single eviction. But under extreme load with many rapid connections, evictions could be frequent.
- **Suggested fix:** Low priority. Current performance is acceptable. If connection counts grow significantly, consider a min-heap indexed by `createdAt`.

## Previously Found Issues (Still Open)

- D3: JWT callback DB query on every request — MEDIUM (same as CR11-PR1)
- AGG-3 (cycle-10): Dual-query pagination in 4 routes — LOW (partially fixed for submissions)
