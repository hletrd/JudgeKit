# Cycle 19 Performance Reviewer Findings

**Date:** 2026-04-19
**Reviewer:** Performance, concurrency, CPU/memory/UI responsiveness
**Base commit:** 301afe7f

---

## Findings

### F1: React `cache()` does not deduplicate `getRecruitingAccessContext` calls in API routes — redundant DB queries for permission checks

- **File**: `src/lib/recruiting/access.ts:79-85`, `src/lib/auth/permissions.ts:22,115,158`
- **Severity**: MEDIUM
- **Confidence**: HIGH
- **Description**: The `cache()` wrapper on `getRecruitingAccessContext` only works within a single React Server Component render. When called from API route handlers (which are not RSCs), the cache is not in scope, so every call hits the database. The permission functions `canAccessGroup`, `canAccessProblem`, and `getAccessibleProblemIds` all independently call `getRecruitingAccessContext`. In a single API request that checks multiple permissions (e.g., listing submissions with per-item checks), this results in 2+ redundant DB queries per permission check.
- **Concrete failure scenario**: An instructor requests the submissions list API. The handler calls `canAccessSubmission` for each submission row. If 20 submissions are returned, and each check triggers `getRecruitingAccessContext` (2 DB queries each), that's 40 redundant DB queries for recruiting context data that's identical across all checks.
- **Suggested fix**: Pass the recruiting context as a parameter through the permission check chain, or use `AsyncLocalStorage` to cache the context per-request across both RSC and API route contexts.

### F2: SSE connection tracking eviction scans `connectionInfoMap` with O(n) linear scan — performance degrades at high connection counts

- **File**: `src/app/api/v1/submissions/[id]/events/route.ts:44-55`
- **Severity**: LOW
- **Confidence**: MEDIUM
- **Description**: The `addConnection` function evicts the oldest connection by iterating over the entire `connectionInfoMap` to find the entry with the smallest `createdAt`. This is O(n) where n is the number of tracked connections. With `MAX_TRACKED_CONNECTIONS = 1000`, this is acceptable under normal load, but under a connection burst (e.g., contest start with 500 simultaneous SSE connections), each new connection requires scanning up to 1000 entries.
- **Concrete failure scenario**: A contest starts and 200 students connect to the SSE endpoint within seconds. Each `addConnection` call scans up to 400 entries. Total: 200 * 400/2 = 40,000 iterations. This adds a few milliseconds of CPU time, which is unlikely to cause visible latency but is unnecessary.
- **Suggested fix**: Use a sorted data structure (e.g., a min-heap or sorted array) for age-based eviction. Alternatively, use a doubly-linked list with LRU eviction. Given the cap of 1000 entries, this is low priority.

### F3: `canAccessProblem` performs multiple sequential DB queries per problem — could be batched for list endpoints

- **File**: `src/lib/auth/permissions.ts:107-145`
- **Severity**: LOW
- **Confidence**: MEDIUM
- **Description**: `canAccessProblem` checks capabilities, then recruiting access (2 DB queries), then queries the problem for visibility/author, then queries `problemGroupAccess + enrollments`. For a list of N problems, calling `canAccessProblem` N times results in O(N) sequential DB round-trips. The function `getAccessibleProblemIds` (line 147) exists and correctly batches the group-based check, but it's not used by all API routes.
- **Concrete failure scenario**: The practice problems page loads 50 problems. For each problem, `canAccessProblem` is called. If the user is not an admin and not a recruiting candidate, that's 50 sequential problem queries + 50 problemGroupAccess queries = ~100 DB round-trips.
- **Suggested fix**: Ensure all list endpoints use `getAccessibleProblemIds` instead of per-item `canAccessProblem` checks.

---

## Verified Safe

### VS1: `import-transfer.ts` buffer-based accumulation correctly avoids OOM
- **File**: `src/lib/db/import-transfer.ts:14-40`
- The `readStreamBytesWithLimit` function uses `Uint8Array` accumulation and single-copy concatenation. Peak memory for a 100 MB upload is now ~100 MB (buffer) + parsed result, instead of the previous ~300 MB.

### VS2: SSE shared polling correctly batches DB queries
- **File**: `src/app/api/v1/submissions/[id]/events/route.ts:152-179`
- The `sharedPollTick` function queries all active submission IDs in a single `IN` query, avoiding per-submission DB round-trips.

### VS3: Compiler execution uses module-level concurrency limiter
- **File**: `src/lib/compiler/execute.ts:32`
- `executionLimiter = pLimit(Math.max(cpus().length - 1, 1))` caps parallel Docker container spawning to prevent resource exhaustion.
