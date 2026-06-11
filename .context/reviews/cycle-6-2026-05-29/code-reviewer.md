# Cycle 6 — Code-quality review (logic, SOLID, maintainability)

**HEAD:** d1217b5a · Baseline green.

## Findings

### N6-C6 (AGREE) — missing terminal-state transition for crashed workers — **MEDIUM-LOW**
See debugger.md/architect.md. Implementation guidance for clean code:
- Add a pure predicate `shouldMarkWorkerOffline(lastHeartbeatAt, now, staleClaimTimeoutMs)` (or reuse `computeActiveTasksResetCutoff`) in `worker-staleness.ts` so the route stays declarative and the predicate is unit-tested without a DB. The reap cutoff is the SAME as the active_tasks-reset cutoff (a worker silent past the stale-claim timeout can hold no reclaimable claim and has no real in-flight work), so the two operations should be combined into ONE UPDATE: `SET status='offline', deregistered_at=now, active_tasks=0 WHERE status='stale' AND last_heartbeat_at < cutoff`. This both fixes N6-C6 and subsumes the cycle-5 N1 active_tasks-reset UPDATE (no behavior change for active_tasks: a row being reaped to offline also gets active_tasks=0, which is what N1 already did).
- Update the file comment block (`heartbeat/route.ts:91-101`) to document the terminal transition.

### Minor — `register/route.ts` local consts duplicate `worker-staleness.ts` — **LOW**
`HEARTBEAT_INTERVAL_MS` (register/route.ts:21) duplicates `worker-staleness.ts:27`; `STALE_CLAIM_TIMEOUT_MS` (line 22) duplicates the default in `system-settings-config`. Already tracked as DOC-C5-2 (dead advertised field). No action this cycle (deferred).

### ICPC `wrongBeforeAc` raw-vs-rounded score — **LOW (informational)**
`contest-scoring.ts:238` uses raw `score < 100` while `hasAc`/`first_ac_at` use `ROUND(score::numeric,2)=100`. Cannot diverge in practice: `verdict.ts:46` emits scores already rounded to 2 decimals, so raw and rounded agree at the 100 boundary. Consistency nit, not a defect. No action.

## Final sweep
Naming/JSDoc consistent post-cycle-5 (rate-limit `scope` rename landed). No dead code beyond the already-tracked register field. No new SOLID violations.
