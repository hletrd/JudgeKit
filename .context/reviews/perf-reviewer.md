# Performance Review — Cycle 5

**Reviewer:** perf-reviewer
**Date:** 2026-05-12

---

## Finding 1: LRU cache stale-while-revalidate may pile up under load

**File:** `src/lib/assignments/contest-scoring.ts:114-145`
**Severity:** LOW
**Confidence:** Medium

The background refresh uses an async IIFE with `await _computeContestRankingInner`. Under very high load (many concurrent requests for the same stale assignment), multiple background refreshes could queue up because:
1. Request 1 sees stale cache, adds key to `_refreshingKeys`, starts refresh
2. Request 2 arrives before refresh completes, sees stale cache, but `_refreshingKeys.has()` returns true, so it skips
3. Request 3 arrives after refresh completes but before cache is updated (microscopic window)

The `_refreshingKeys` guard mostly prevents thundering herd, but there's no limit on concurrent background refreshes across DIFFERENT cache keys. With 50 cached assignments all going stale simultaneously, 50 parallel DB queries run.

This is the same finding as C3-AGG-6 (deferred). The `_refreshingKeys` set prevents per-key thundering herd, but cross-key concurrency is unbounded.

**Fix:** Consider a global concurrency limit for background refreshes, or use a single worker thread for cache refresh.

---

## Finding 2: getParticipantTimeline fetches 5000 submissions + 1000 snapshots

**File:** `src/lib/assignments/participant-timeline.ts:163-176`
**Severity:** LOW
**Confidence:** High

The `.limit(5000)` on submissions and `.limit(1000)` on snapshots could still be heavy for participants with many submissions. For a 10-problem contest, that's 500 submissions per problem average before truncation.

The transaction wrapper added in cycle 3 helps consistency but doesn't address the data volume.

**Fix:** Consider pagination or consider if lower limits are acceptable. This is deferred per C3-AGG-5.

---

## Finding 3: Raw query in getDbNowUncached adds latency inside transactions

**File:** `src/lib/db-time.ts:33-38`
**Severity:** LOW
**Confidence:** High

Every call to `getDbNowUncached()` executes a round-trip `SELECT NOW()`. When called inside a transaction (like in submissions POST), this adds an extra query before the actual work. For high-throughput endpoints, this adds up.

**Fix:** For transaction contexts, use `tx.execute(sql"SELECT NOW()")` instead, or pass the time from outside the transaction.
