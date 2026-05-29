# Cycle 7 — perf-reviewer

## N7-C7 fix perf impact — negligible
The proposed fix adds a LEFT JOIN to `score_overrides` (indexed: `score_overrides_assignment_idx` on `assignment_id`, plus the unique `(assignment_id, problem_id, user_id)` index — `schema.pg.ts:688-693`) inside the existing single ranking aggregation, OR a parallel small `SELECT` overlaid in memory (as the gradebook already does — `submissions.ts:605` runs the override fetch in `Promise.all` with the main aggregation). Override rows are bounded by (#students × #problems) for the assignment and almost always tiny (manual instructor actions). Either approach is O(overrides) extra work, cached by the existing 30s ranking LRU. No hot-path regression.

Recommendation: mirror the gradebook's pattern — fetch overrides in parallel and overlay in memory, rather than complicating the window-function SQL. Cheaper to reason about and keeps the SQL aggregation unchanged.

## Existing perf posture — sound
- Ranking cache: LRU max 50, 30s TTL, 15s stale-while-revalidate with single-flight (`_refreshingKeys`) + failure cooldown. Good.
- N6-C6 reaper: one extra UPDATE per heartbeat sweep, indexed by status+heartbeat; bounded by worker count. Fine.
- Carried PERF-2 (sequential Docker image fetches in `docker/client.ts`), DEFER-52 (string accumulation in Docker output parser) — preconditions unchanged, RE-DEFER.

No net-new perf findings.
