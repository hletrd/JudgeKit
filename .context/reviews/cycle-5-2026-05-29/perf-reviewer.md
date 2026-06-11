# Perf Reviewer — Cycle 5 (2026-05-29)

Angle: DB round-trips, hot-path queries, concurrency, caching.

## claim path
- F4 (carried): up to 3 `judge_workers` SELECTs per claim (pre-check 143-150,
  no-claim diagnostic 298-306, plus the CTE's own lock). Bounded by worker count;
  the atomic CTE is the real gate. No profiling signal. Stays deferred.
- The claim CTE is a single round-trip and uses `FOR UPDATE SKIP LOCKED` correctly
  to avoid contention between concurrent workers. Good.

## poll path
- Final-verdict path is one transaction (update + delete + insert + worker
  decrement). In-progress path likewise. No N+1. `invalidateRankingCache` is
  fire-and-forget and correctly does not block the response. Good.

## contest-scoring
- Stale-while-revalidate cache (`contest-scoring.ts`) with 15 s stale / 30 s TTL,
  single-flight via `_refreshingKeys`, failure cooldown to avoid thundering herd.
  Well-engineered; staleness check uses `Date.now()` to avoid a DB round-trip on
  cache hits, with authoritative `getDbNowMs()` only on writes. No finding.
- `invalidateRankingCache(assignmentId)` iterates ALL cache keys
  (`contest-scoring.ts:82`) to delete frozen variants — O(cache size ≤ 50) per
  invalidation. Negligible. No finding.

## rate-limiter
- Two-tier (sidecar pre-check → authoritative DB txn). Sidecar never fail-closes
  (returns null on unreachable → DB fallback). DB path uses SELECT FOR UPDATE to
  close TOCTOU. No new perf finding.

## PERF-C5-1 (= N1, indirect) — orphaned stale rows are unbounded
Not a latency issue, but `judge_workers` grows by one row per worker restart with
no reaper (register always INSERTs). Over a long-running deployment with frequent
worker restarts the table accumulates dead rows that every `admin/workers` list and
the health `count(*) FILTER` scan must read. Negligible until thousands of restarts,
but the reaper proposed for N1 also bounds this. Low.

No High perf findings. Net-new: PERF-C5-1 (= N1).
