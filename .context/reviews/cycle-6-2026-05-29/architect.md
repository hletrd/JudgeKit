# Cycle 6 — Architect review (coupling, layering, lifecycle invariants)

**HEAD:** d1217b5a · Baseline green.

## Findings

### N6-C6 (AGREE w/ debugger) — worker lifecycle has no terminal transition for crashed workers — **MEDIUM-LOW**
The judge-worker state machine is `online -> stale -> (online | offline)`. The `stale -> online` edge exists (heartbeat resurrection). The `stale -> offline` edge ONLY fires on the *cooperative* paths (graceful deregister `deregister/route.ts:63`, admin DELETE). There is no server-driven terminal transition for a worker that crashes and never cooperates. This is an architectural gap: the only "self-healing" actor in the system is the piggybacked heartbeat sweep (`heartbeat/route.ts:79-115`), and it stops short of the terminal state. Result: `stale` is effectively a permanent absorbing state for crashed workers, which (a) pins `admin-health` at `degraded` (`admin-health.ts:89`) and (b) lets dead rows accumulate. The sweep is the correct layer to own this transition — it already runs on every heartbeat, already computes the stale-claim cutoff, and already mutates worker rows. Adding the `stale -> offline` edge there keeps the lifecycle logic in one place rather than introducing a separate cron/reaper service.

**Design constraint to honor:** use `offline` (not row deletion) so the admin inventory (`admin/workers/route.ts:16-34`) keeps showing the crashed worker with its `deregisteredAt` for post-mortem. Deletion is reserved for the explicit admin DELETE action.

### Layering: cutoff helpers already extracted (`worker-staleness.ts`) — GOOD
The cycle-5 N1 refactor put the pure threshold math in `src/lib/judge/worker-staleness.ts` with unit tests. The reaper predicate should be added there as a sibling pure helper (`shouldMarkOffline` / `computeOfflineReapCutoff`) so it's unit-testable without a DB, matching the existing pattern.

### F4 (re-assess) — coupling smell, not actionable
The auth helper (`auth.ts:52`) and claim route both fetch the worker row. Cleaner design would have the auth helper return the fetched row so the claim route reuses it. Deferred (no perf signal); architectural debt only.

## Final sweep
contest-scoring SWR cache (`contest-scoring.ts`) is well-layered (pure inner fn + cache wrapper). No new coupling regressions since cycle 5.
