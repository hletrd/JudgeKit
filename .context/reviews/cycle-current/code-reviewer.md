# Code Quality Review — Cycle 1/100

**Date:** 2026-05-08
**HEAD:** main / 5cec65e8
**Reviewer:** code-reviewer (consolidated single-pass)

---

## Findings

### C1 — MEDIUM — `execTransaction` build-phase fallback does not wrap in transaction

- **File:** `src/lib/db/index.ts:64-72`
- **Description:** During `NEXT_PHASE === "phase-production-build"`, `execTransaction` simply calls `fn(db)` without any transaction wrapper. This means any code that assumes transactional atomicity (e.g., rate limit checks, submission inserts with advisory locks) will silently run without transactions during build/type-check. While build-phase DB access is typically minimal, this is a footgun for any SSR during build that touches the database.
- **Confidence:** HIGH
- **Suggested fix:** Document the limitation more prominently. Consider throwing if `execTransaction` is called during build with a callback that uses advisory locks or expects transaction semantics.

### C2 — MEDIUM — `rateLimiter` queue size check is racy

- **File:** `src/lib/judge/auto-review.ts:32`
- **Description:** The check `reviewLimiter.activeCount + reviewLimiter.pendingCount >= MAX_REVIEW_QUEUE_SIZE` reads two properties of the p-limit internal state. While `p-limit` is not explicitly documented as thread-safe for these properties, in single-threaded Node.js this is acceptable. However, if this code ever runs in a Worker Thread, the read could race with internal updates. More importantly, the check happens OUTSIDE the `reviewLimiter()` call, so two concurrent calls could both pass the check and then both enter the limiter, temporarily exceeding `MAX_REVIEW_QUEUE_SIZE`.
- **Confidence:** MEDIUM
- **Suggested fix:** Move the queue size check inside the `reviewLimiter()` wrapper so it is serialized with other limiter operations.

### C3 — MEDIUM — `cleanupContainer` may leak on `stopContainer` fire-and-forget

- **File:** `src/lib/compiler/execute.ts:295-311`
- **Description:** `stopContainer` uses `spawn` without awaiting and calls `.unref()`. If the stop signal fails (e.g., Docker daemon is busy), the container may remain running indefinitely. The `cleanupContainer` function is only called from the `finish()` handler after the process exits or errors, but if `stopContainer` fails to actually stop the container, `cleanupContainer`'s `docker rm -f` may also fail because the container is still running and the `rm` timeout is only 5 seconds.
- **Confidence:** MEDIUM
- **Suggested fix:** Increase the `rm` timeout or retry `cleanupContainer` once after a delay. Alternatively, await `stopContainer` with a reasonable timeout before attempting removal.

### C4 — LOW — `parseTimestampEpochMs` does not validate RFC 3339 format strictly

- **File:** `src/lib/compiler/execute.ts:246-254`
- **Description:** The function uses `Date.parse(s)` which accepts many non-RFC-3339 formats. If Docker changes its output format to something `Date.parse` accepts but with different semantics, the duration calculation could be wrong. This is defensive code for container inspection, so impact is low.
- **Confidence:** LOW
- **Suggested fix:** Use a stricter regex to validate the expected format before parsing.

### C5 — LOW — `docker ps` output parsing in `cleanupOrphanedContainers` is fragile

- **File:** `src/lib/compiler/execute.ts:773-857`
- **Description:** The code parses `docker ps` output with tab splitting (`line.split("\t")`) and format string `{{.Names}}\t{{.Status}}\t{{.CreatedAt}}`. If Docker changes its format or if container names/status contain tabs, parsing will break. The `createdAtStr` parsing is especially fragile as it tries `Date.parse()` on an unspecified format string.
- **Confidence:** MEDIUM
- **Suggested fix:** Use `docker ps --format '{{json .}}'` and parse JSON, consistent with `listDockerImagesLocal`.

### C6 — LOW — `WeakMap` key deduplication in `api-rate-limit.ts` relies on request object identity

- **File:** `src/lib/security/api-rate-limit.ts:56-66`
- **Description:** `consumedRequestKeys` is a `WeakMap<NextRequest, Set<string>>`. This deduplicates rate limit consumption only when the exact same `NextRequest` object is passed. In practice, Next.js creates a new request object for each middleware/reroute, so the deduplication is unlikely to trigger. This is harmless but the comment implies it's working deduplication.
- **Confidence:** HIGH
- **Suggested fix:** Clarify the comment or remove the WeakMap if it serves no practical purpose.

### C7 — LOW — `authUserCache` FIFO eviction deletes oldest entries, not least-recently-used

- **File:** `src/proxy.ts:76-99`
- **Description:** The cache eviction uses FIFO (deletes first inserted key) rather than LRU. Under a flash crowd of new users, this could evict active users while keeping stale entries of users who haven't been seen recently. With max 500 entries and 10s TTL, impact is minimal.
- **Confidence:** LOW
- **Suggested fix:** Consider LRU eviction for better hit rates under load spikes.

### C8 — LOW — Redundant `getTranslations` calls in admin pages

- **File:** `src/app/(dashboard)/dashboard/admin/page.tsx:21-23`
- **Description:** Three separate `getTranslations` calls for different namespaces. While React `cache()` deduplicates identical calls, each namespace is a separate call. This is a minor inefficiency.
- **Confidence:** LOW
- **Suggested fix:** Already noted in prior cycle (F4). Consider loading all needed translations in a single call if namespaces are stable.

### C9 — LOW — `getAuthUrlObject()` throws in `proxy.ts` if AUTH_URL is invalid

- **File:** `src/proxy.ts:256`
- **Description:** `getValidatedAuthSecret()` and `getAuthUrlObject()` can throw if env vars are misconfigured. These throws happen inside the middleware and will crash the request rather than returning a graceful error. In production, this could cause 500s during startup misconfiguration.
- **Confidence:** MEDIUM
- **Suggested fix:** Wrap env validation in try/catch and return a 500 with a clear error message rather than letting the exception propagate unhandled.

---

## Code Quality Verdict

The codebase maintains high code quality standards with comprehensive comments, defensive programming, and consistent patterns. Minor issues around concurrency edge cases and output parsing fragility are the main concerns.
