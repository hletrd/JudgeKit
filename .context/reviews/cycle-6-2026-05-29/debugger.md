# Cycle 6 — Debugger review (latent bugs, failure modes, regressions)

**HEAD:** d1217b5a (main) · **Date:** 2026-05-29 · **Baseline:** lint 0/0, tsc 0, build 0, 2459 unit tests / 320 files, lint:bash 0 (all green).

Scope: judge-worker lifecycle (register/heartbeat/claim/poll/deregister), staleness sweep, admin-health, contest scoring, admin worker endpoints. Focus per orchestrator: net-new defects + re-assess open deferred items (F3 worker-result trust, F4 triple worker SELECT, N3 failedTestCaseIndex).

## Findings

### N6-C6 — Crashed worker holds admin-health in `degraded` FOREVER (no `stale -> offline` reaper) — **MEDIUM-LOW, HIGH confidence (confirmed)**
- **Files:** `src/app/api/v1/judge/heartbeat/route.ts:79-115` (sweep), `src/lib/ops/admin-health.ts:84-91` (`stale > 0 => degraded`), `src/lib/judge/worker-staleness.ts` (cutoff helpers).
- **Evidence:** The heartbeat sweep flips `online -> stale` (line 82-89) and, since cycle-5 N1, zeroes `active_tasks` for workers silent past the stale-claim timeout (line 104-115). But NOTHING ever transitions `stale -> offline`. Grep confirms `offline` is set ONLY in `deregister/route.ts:63` (graceful) and via admin DELETE. A SIGKILLed worker that never deregisters stays `status='stale'` indefinitely.
- **Failure scenario:** A worker process is `kill -9`'d (OOM, host reboot, crash). It never sends a graceful deregister. The next surviving worker's heartbeat sweep marks it `stale` and (after 300 s) zeroes its `active_tasks`. The row now sits at `stale` forever. `admin-health.ts:89` returns `status: "degraded"` whenever `stale > 0`, so the admin health page is pinned at **degraded permanently** even though the cluster is perfectly healthy. Operators lose the signal value of "degraded" (alert fatigue), and dead `stale` rows accumulate unbounded across restarts (each crash leaves a new row; restart registers a fresh online row).
- **Why cycle-5 N1 did not fix this:** N1 explicitly noted "admin-health reports degraded while any worker is stale with no reaper, so a single crash keeps health degraded indefinitely" but only fixed the `active_tasks` leak, NOT the status transition. This is the documented residual.
- **Fix:** Extend the existing sweep to transition `stale -> offline` once a worker is silent well past the stale-claim timeout (same cutoff already computed for the active_tasks reset, since a worker that old can no longer hold any reclaimable claim). Mirror the graceful-deregister terminal state: `status='offline'`, `deregisteredAt=now`, `activeTasks=0`. Offline rows still appear in the admin inventory (with `deregisteredAt`), so operator visibility is preserved; only the health alarm clears. Add regression tests for the reaper predicate (past timeout -> offline; recently stale -> stays stale).

### N3 (re-assess, carried deferred) — `failedTestCaseIndex` = worker array position — **LOW, MEDIUM confidence**
- `verdict.ts:22-31` derives `failedTestCaseIndex` from `results.findIndex(...)`, i.e. the worker-supplied ordering. Trust-boundary-gated (per-worker secret + claimToken + IP allowlist). No new evidence of mis-ordering in prod. **Remains correctly deferred** under F3's trust model. No change this cycle.

### F3 (re-assess, carried deferred) — worker result trust / score inflation — **LOW, MEDIUM confidence**
- `poll/route.ts:134` + `verdict.ts:39-46`: `score = passed / results.length`; `testCaseId` is FK-constrained but not scoped to the claimed problem. Trust model UNCHANGED this cycle (no untrusted/3rd-party workers introduced). The fix adds a poll hot-path query and defends only against a compromised trusted worker. **Remains correctly deferred.**

### F4 (re-assess, carried deferred) — redundant `judge_workers` SELECTs in claim — **LOW, MEDIUM confidence**
- `claim/route.ts`: `isJudgeAuthorizedForWorker` (auth.ts:62) fetches `{secretTokenHash}`, then lines 143-150 fetch `{status, secretTokenHash}` again; lines 298-306 fetch `{status,activeTasks,concurrency}` only on the no-claim branch. The two pre-claim reads are genuinely redundant. Still no DB-profiling signal; bounded by worker count. **Remains correctly deferred** (no measured cost); folding requires the auth helper to return the row.

## Final sweep
No new race conditions in the sweep (both updates `await`ed, DB-time cutoffs). Deregister/DELETE are transactional. ICPC `wrongBeforeAc` raw-vs-rounded score (`contest-scoring.ts:238-239`) cannot diverge in practice because `verdict.ts:46` already emits 2-decimal scores (Low/informational, not a defect).
