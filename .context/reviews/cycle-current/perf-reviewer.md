# Performance Review — Cycle 1/100

**Date:** 2026-05-08
**HEAD:** main / 5cec65e8
**Reviewer:** perf-reviewer (consolidated single-pass)

---

## Findings

### P1 — MEDIUM — `getAssignmentStatusRows` builds in-memory Cartesian product

- **File:** `src/lib/assignments/submissions.ts:523-758`
- **Description:** The function loads all enrolled students and all assignment problems, then maps over `enrolledStudents.map(...problemDefinitions.map(...))`. For a large assignment with 500 students and 10 problems, this creates 5000 inner loop iterations in JavaScript. The SQL aggregation is well-optimized (single query with GROUP BY), but the in-memory assembly could become a CPU bottleneck for large contests. The `problemAggMap` and `userLatestMap` lookups are O(1), but the nested map still scales as O(students * problems).
- **Confidence:** HIGH
- **Suggested fix:** Consider streaming the response or paginating the status board. For very large assignments, the current approach may block the event loop for tens of milliseconds.

### P2 — MEDIUM — `proxy.ts` auth cache does not use LRU, causes churn under load

- **File:** `src/proxy.ts:22-99`
- **Description:** The in-process auth cache uses a simple Map with FIFO eviction (500 entries, 2-10s TTL). Under high concurrency with many unique users, the cache hit rate may be poor because new entries evict older ones regardless of access frequency. Each request creates a new cache key based on `userId:authenticatedAt`, so token refreshes create new entries while old ones become garbage.
- **Confidence:** MEDIUM
- **Suggested fix:** Use `lru-cache` (already a project dependency) with TTL support. This would improve hit rates and provide better eviction semantics.

### P3 — MEDIUM — `consumeApiRateLimit` makes two sequential DB calls per request

- **File:** `src/lib/security/api-rate-limit.ts:167-195`
- **Description:** For every API request with rate limiting enabled, the code first calls `sidecarConsume(key)` (which may hit the Rust sidecar over HTTP), and then calls `atomicConsumeRateLimit(key)` (which hits PostgreSQL in a transaction). Even when the sidecar rejects (fast path), the DB call still runs for "consistency." This doubles the latency of every rate-limited request.
- **Confidence:** HIGH
- **Suggested fix:** Consider making the DB path conditional on sidecar health. If the sidecar consistently rejects requests for a key, skip the DB update until the window resets.

### P4 — LOW — `cleanupOrphanedContainers` runs synchronous `docker` CLI commands serially

- **File:** `src/lib/compiler/execute.ts:773-857`
- **Description:** Each container removal awaits `exec("docker", ["rm", "-f", container])` sequentially in a loop. With many orphaned containers, this could take O(n * timeout) time. The function is typically called on startup/periodically, not per-request.
- **Confidence:** LOW
- **Suggested fix:** Batch removals with `docker rm -f container1 container2 ...` or use `Promise.all` with limited concurrency.

### P5 — LOW — `getRecruitingAccessContext` may cause N+1 queries in list views

- **File:** `src/lib/recruiting/access.ts:34-108`
- **Description:** The function is cached per-request via React `cache()` and AsyncLocalStorage, but if called with different `userId` values in the same request (e.g., an admin listing all users), each unique userId triggers a separate DB query. The current usage patterns call it with the current user's ID only.
- **Confidence:** LOW
- **Suggested fix:** Document the intended usage (single current user per request) or add a bulk variant for admin list views.

### P6 — LOW — `buildIoiLatePenaltyCaseExpr` generates SQL string on every call

- **File:** `src/lib/assignments/scoring.ts` (referenced from submissions.ts:616)
- **Description:** The raw SQL expression for late penalty scoring is rebuilt as a string on every call. This is minor overhead but could be cached as a prepared statement or template.
- **Confidence:** LOW
- **Suggested fix:** Pre-compile the SQL template once at module load time.

---

## Performance Verdict

The system is well-architected for performance with SQL-level aggregation, advisory locks for concurrency, and p-limit for resource gating. The main concerns are the in-memory Cartesian product in status rows (P1) and the dual rate-limit path (P3).
