# Cycle 8 — perf-reviewer lens

**HEAD:** db1a28d0. Focus: ranking subsystem query cost.

## On N8-C8-LIVERANK fix
The fix replaces a single-level `GROUP BY user_id` with a two-level aggregate (per-problem CTE then per-user SUM). Cost is unchanged-to-better: the inner per-problem aggregate scans the same `submissions ⨝ assignment_problems ⨝ exam_sessions` set once; the outer SUM is over the (small) per-problem result set. No extra table scan, no extra round-trip. The query already filters by `assignment_id` and terminal status. No perf regression. CONCUR with the fix.

## No NEW perf findings
- Ranking cache (`contest-scoring.ts:58`) LRU max 50 / 30s TTL / 15s stale-while-revalidate with single-flight `_refreshingKeys` + failure cooldown — sound. No change.
- Carried deferred perf items unchanged (AGG-2 rate-limit Date.now hot path; ARCH-CARRY-2 SSE O(n) eviction; PERF-3 anti-cheat; C2-AGG-6 practice filter). Preconditions unchanged → re-defer.
