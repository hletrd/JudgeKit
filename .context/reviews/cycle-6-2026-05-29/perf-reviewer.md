# Cycle 6 — Performance review

**HEAD:** d1217b5a · Baseline green.

## Findings

### N6-C6 (perf angle) — unbounded `stale` row accumulation — **LOW (perf), MEDIUM-LOW (overall)**
Without a `stale -> offline` reaper, every crashed worker leaves a permanent `stale` row. Over months of crashes/host-reboots this grows the `judge_workers` table monotonically. The `admin-health` COUNT FILTER query (`admin-health.ts:71-77`) and the admin inventory full scan (`admin/workers/route.ts:33`) both scan all rows. There is a `judge_workers_status_idx` (schema.pg.ts:444) so the COUNT can use it, but the table never shrinks. The reaper (mark `stale -> offline` past timeout) does not delete rows but does bound the *active stale* set and lets a future retention sweep prune long-offline rows. Net: the reaper is the right first step; row pruning of long-offline workers is a separate (lower-priority) follow-up.

### Sweep cost — acceptable
The heartbeat sweep already issues 2 UPDATE statements per heartbeat (status flip + active_tasks reset). Adding the `stale -> offline` UPDATE makes it 3. Each is a single indexed UPDATE on `judge_workers` (tiny table). With a 30 s heartbeat interval and a handful of workers, this is negligible. To avoid a 3rd statement, the reaper can be folded into the active_tasks-reset UPDATE (same cutoff): one UPDATE sets `status='offline', deregistered_at=now, active_tasks=0` for rows `stale AND last_heartbeat < reset_cutoff`. **Recommended:** fold into a single UPDATE to keep per-heartbeat statement count flat.

### F4 (re-assess) — still no profiling signal
3 SELECTs on a tiny indexed table per claim. No measurable cost. Deferred.

## Final sweep
contest-scoring SWR cache, ranking-cache invalidation fire-and-forget (`poll/route.ts:186-193`) — no regressions. Polling-interval visibility-pause (C1-PR-1) remains a known deferred item; not re-flagging.
