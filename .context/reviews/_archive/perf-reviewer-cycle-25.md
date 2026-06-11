# Performance Reviewer — Cycle 25

**Date:** 2026-04-24
**Scope:** Full repository performance review

---

## P-1: [MEDIUM] `getAssignmentStatusRows` fetches all enrolled students + all submissions separately, then joins in-memory

**Confidence:** HIGH
**Citations:** `src/lib/assignments/submissions.ts:481-717`

The `getAssignmentStatusRows` function makes three separate DB queries:
1. Fetch the assignment metadata (1 row)
2. Fetch all enrolled students (N rows)
3. Fetch all assignment problems (M rows)
4. Fetch per-(user, problem) aggregated stats via raw SQL (N*M rows worst case)
5. Fetch score overrides (small)

Then it joins everything in JavaScript memory. For a large class (e.g., 500 students, 10 problems), this works fine. But for very large deployments, the in-memory join could become a bottleneck.

The real concern is that query (4) uses a CTE with `ROW_NUMBER() OVER (PARTITION BY user_id, problem_id ORDER BY submitted_at DESC, sub_id DESC)` which scans all submissions for the assignment. For a contest with 500 students and 10 problems, each student making 20 submissions on average, this scans 100K submission rows. This is acceptable for current scale but worth monitoring.

**Fix:** No immediate fix required. Consider pagination or streaming for very large assignments in the future.

---

## P-2: [LOW] `authUserCache` in proxy.ts uses `Map.keys().next()` for FIFO eviction — O(1) but iterates to find expired entries

**Confidence:** LOW
**Citations:** `src/proxy.ts:71-77`

When the cache is at 90% capacity, the cleanup loop iterates all entries to find expired ones. With a max size of 500, this is negligible. The FIFO eviction via `Map.keys().next()` is O(1) and correct since Map preserves insertion order.

**Fix:** No fix required at current scale.

---

## Positive Observations

- Ranking cache uses stale-while-revalidate pattern with `Date.now()` for staleness check (avoiding DB round-trips on cache hits)
- Analytics cache uses the same stale-while-revalidate pattern
- SSE polling uses a shared timer for all connections (batch query approach)
- ZIP validation now uses metadata instead of decompression (cycle 24 fix — significant perf improvement)
- Batched DELETE in data retention prevents long-running locks
- Rate limit eviction runs on a 1-minute timer instead of per-request
- API rate limit uses sidecar fast-path before DB check
- Audit event writes are buffered and flushed in batches
