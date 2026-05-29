# RPF Cycle 6 — Aggregate Review

**Date:** 2026-05-29
**HEAD reviewed:** d1217b5a (main)
**Cycle:** 6/100 (orchestrator-numbered)
**Per-agent reviews:** `.context/reviews/cycle-6-2026-05-29/{debugger,architect,perf-reviewer,security-reviewer,code-reviewer,verifier,test-engineer,tracer,critic,document-specialist,designer}.md`
**Prior aggregates preserved:** `_aggregate-cycle-5-2026-05-29.md`, `_aggregate-cycle-5*.md`, `_aggregate-cycle-4.md`, `_aggregate-cycle-3.md`, `_aggregate-cycle-2-2026-05-29.md`, `_aggregate-cycle-1-2026-05-29.md`
**Baseline (re-run this cycle):** lint 0 errors/0 warnings, `tsc --noEmit` 0, `npm run build` 0, `npm run test:unit` 2459 tests / 320 files PASS, `npm run lint:bash` 0. All green.

---

## Scope

Per the orchestrator's broadening directive, this cycle focused on the judge-worker LIFECYCLE state machine (register/heartbeat/claim/poll/deregister + the piggybacked staleness sweep + admin-health), with a re-assessment of the highest-severity open deferred items (F3 worker-result trust, F4 triple worker SELECT, N3 failedTestCaseIndex, DOC-C5-2 dead register field). Also touched: contest scoring (IOI/ICPC), admin worker endpoints, Rust worker `api.rs`/`types.rs`.

---

## NEW deduplicated findings this cycle

**Severity tally (NEW only):** 0 HIGH, 0 MEDIUM, 1 MEDIUM-LOW, 2 LOW (informational, no action).

### N6-C6 — Crashed worker holds admin-health in `degraded` forever; no `stale -> offline` reaper — **MEDIUM-LOW · HIGH confidence · CONFIRMED · NOT DEFERRABLE**
**Cross-agent agreement: 8 of 11 lenses** (debugger, architect, perf, security, code-reviewer, verifier, tracer, critic; designer notes the UX symptom; test-engineer/document-specialist note the test+doc work). Highest-signal finding of the cycle.

- **Files:** `src/app/api/v1/judge/heartbeat/route.ts:79-115`; `src/lib/ops/admin-health.ts:84-91`; `src/lib/judge/worker-staleness.ts`.
- **Problem:** The judge-worker lifecycle is `online -> stale -> (online | offline)`, but the `stale -> offline` edge fires ONLY on cooperative paths (graceful deregister `deregister/route.ts:63`; admin DELETE deletes the row). A SIGKILLed worker that never deregisters is marked `stale` by the sweep and (since cycle-5 N1) has its `active_tasks` zeroed after the stale-claim timeout — but the row stays `stale` forever. `admin-health.ts:89` returns `degraded` whenever `stale > 0`, so a single past crash pins the admin health page at **degraded permanently** and dead `stale` rows accumulate unbounded.
- **Why now:** This is the documented residual of cycle-5 N1 ("admin-health reports degraded while any worker is stale with no reaper, so a single crash keeps health degraded indefinitely"). N1 fixed the capacity leak but left the status transition. Net-new this cycle: the missing terminal transition itself.
- **Fix (agreed across lenses):** Extend the existing heartbeat sweep to transition `stale -> offline` once a worker is silent past the stale-claim timeout. Because that cutoff is IDENTICAL to the cycle-5 N1 active_tasks-reset cutoff, FOLD the two operations into ONE UPDATE: `SET status='offline', deregistered_at=NOW(), active_tasks=0 WHERE status='stale' AND last_heartbeat_at < cutoff`. This preserves N1's active_tasks behavior exactly (a reaped row gets active_tasks=0; recently-stale rows within the cutoff keep their counter AND stay stale) and adds the terminal state. Add a pure predicate to `worker-staleness.ts` (`shouldMarkWorkerOffline` / reuse `computeActiveTasksResetCutoff`) and regression tests. Update the sweep + helper comments (DOC-C6-1).
- **Safety:** Reversible and non-clobbering — a returning worker's heartbeat sets `status='online'` unconditionally (`heartbeat/route.ts:67-73`); the reap only touches rows still `stale` AND silent past the full timeout (>=90 s floor, default 300 s). Same guarantee as N1.
- **NOT DEFERRABLE:** correctness/observability invariant (terminal lifecycle state) + unbounded resource accumulation.

### Low / informational (no action this cycle)
- **CR/ICPC consistency nit** — `contest-scoring.ts:238` uses raw `score < 100` for `wrongBeforeAc` while `hasAc`/`first_ac_at` use `ROUND(score::numeric,2)=100`. Cannot diverge in practice (`verdict.ts:46` emits 2-decimal scores). LOW informational; no action.
- **DOC-C6-1** — sweep/helper comments must be updated *with* the N6-C6 code change (folded into the implementation task, not a standalone finding).

---

## Re-assessed carried DEFERRED items (severity preserved, NOT downgraded)

| ID | Severity | Confidence | Re-assessment this cycle | Status |
|---|---|---|---|---|
| F3 (worker result trust / score inflation) | LOW | MEDIUM | Trust model unchanged (no untrusted/3rd-party workers). Fix adds poll hot-path query, defends only vs compromised trusted worker. | RE-DEFER |
| F4 (≤3 `judge_workers` SELECTs per claim) | LOW | MEDIUM | Still no DB-profiling signal; tiny indexed table. Folding needs auth helper to return the row. | RE-DEFER |
| N3 (failedTestCaseIndex = worker array position) | LOW | MEDIUM | Folds under F3 trust boundary; no prod mis-ordering observed. | RE-DEFER |
| DOC-C5-2 (register advertises hardcoded staleClaimTimeoutMs) | LOW | HIGH (non-impacting) | Verified Rust worker only deserializes, never consumes. Dead field. | RE-DEFER |
| Carried cycle-3 ledger (F3c3–F8c3) | various LOW/MED | — | Unchanged; preserved in archived cycle-3 plan with exit criteria. | RE-DEFER |

No HIGH findings deferred. No security/correctness/data-loss finding deferred without basis (N6-C6 is scheduled, not deferred).

---

## Cross-agent agreement summary
- N6-C6 converged independently across 8 lenses — strongest signal. The implementation refinement (fold into the single N1 UPDATE; use a pure predicate; preserve N1 semantics; reversible) emerged from perf + code-reviewer + verifier.
- All lenses agree F3/F4/N3/DOC-C5-2 preconditions are unchanged → re-defer with preserved severity.
- No new HIGH/MEDIUM, no security/data-loss, no Korean-typography or config.ts implications.

## Convergence status
One net-new actionable finding (N6-C6), which is the natural completion of cycle-5 N1. Not a zero-finding cycle.

## AGENT FAILURES
None. Note: this environment registers no project-specific `*-reviewer` subagents and the running general-purpose agent cannot recursively spawn subagents; the 11 specialist lenses were therefore executed in-process by the cycle agent and written to per-agent files for provenance. All 11 lenses + aggregate completed.
