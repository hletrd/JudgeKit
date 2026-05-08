# Performance Review — Cycle 1 (2026-05-03)

**Reviewer:** perf-reviewer
**Scope:** Performance, concurrency, CPU/memory/UI responsiveness
**HEAD:** 689cf61d

---

## Findings

### C1-PERF-1: JWT callback queries database on every request
**File:** `src/lib/auth/config.ts:394-407`
**Severity:** MEDIUM | **Confidence:** HIGH

The `jwt()` callback in the NextAuth config runs on every API request that checks auth. It queries `db.query.users.findFirst` on every invocation to refresh the token with the latest user data. For a high-traffic deployment, this means one DB query per authenticated API request just for auth.

**Fix:** Cache the user record in the JWT for a short TTL (e.g., 60 seconds) and only re-query after the TTL expires. Or use a lightweight session validation that only checks `isActive` and `tokenInvalidatedAt` (two small columns) rather than fetching all auth columns.

### C1-PERF-2: SSE connection cleanup timer runs every 60s regardless of active connections
**File:** `src/app/api/v1/submissions/[id]/events/route.ts:125-141`
**Severity:** LOW | **Confidence:** MEDIUM

The `setInterval` cleanup timer fires every 60 seconds even when there are zero active connections. While the timer body short-circuits when `connectionInfoMap.size === 0`, the timer itself is never cleared once registered (due to `globalThis.__sseCleanupInitialized` guard).

**Fix:** Clear the interval when `connectionInfoMap` reaches zero and re-register when a new connection is added. This is a minor optimization — the `unref()` call already allows the process to exit.

### C1-PERF-3: Shared SSE poll timer reads `getConfiguredSettings()` on every tick
**File:** `src/app/api/v1/submissions/[id]/events/route.ts:190-193`
**Severity:** LOW | **Confidence:** MEDIUM

`startSharedPollTimer()` calls `getConfiguredSettings()` and uses the result as the interval. However, once the timer is started, it never adjusts its interval if the setting changes at runtime. The stale threshold uses a 5-minute TTL cache, but the poll timer interval is fixed for the lifetime of the timer.

**Fix:** Restart the poll timer when `ssePollIntervalMs` changes. This is a minor UX issue — the setting rarely changes in practice.

---

## Positive Performance Observations

- Docker build output uses a head+tail buffer strategy (32KB head + 2MB total) to bound memory usage.
- Compiler execution uses `pLimit` with CPU-count-based concurrency to prevent container spawning exhaustion.
- Image processing converts to WebP with quality 85 — good compression for storage and bandwidth.
- ZIP validation uses fast-path metadata reading before falling back to decompression.
- File serving uses ETags for conditional requests (304 responses save bandwidth).
