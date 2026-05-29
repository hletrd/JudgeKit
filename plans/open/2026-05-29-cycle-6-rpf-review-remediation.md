# Cycle 6 RPF Review Remediation Plan

**Date:** 2026-05-29
**Cycle:** 6/100 of this RPF loop (orchestrator-numbered)
**Aggregate:** `.context/reviews/_aggregate.md` (cycle-6) + `_aggregate-cycle-6-2026-05-29.md`
**Per-agent reviews:** `.context/reviews/cycle-6-2026-05-29/{code-reviewer,perf-reviewer,security-reviewer,critic,verifier,test-engineer,tracer,architect,debugger,document-specialist,designer}.md`
**Prior-cycle aggregates preserved:** `_aggregate-cycle-5-2026-05-29.md`, `_aggregate-cycle-4.md`, `_aggregate-cycle-3.md`, `_aggregate-cycle-2-2026-05-29.md`, `_aggregate-cycle-1-2026-05-29.md`

---

## Summary

Cycle 6 reviewed the judge-worker LIFECYCLE state machine (register / heartbeat /
claim / poll / deregister + the piggybacked staleness sweep + admin-health), and
re-assessed the open deferred items (F3, F4, N3, DOC-C5-2). Baseline fully green
(lint 0/0, tsc 0, build 0, test:unit 2459 / 320 files, lint:bash 0).

**1 net-new actionable finding (implement now), 0 informational deferred-new, 4
carried deferred (F3/F4/N3/DOC-C5-2, severity preserved).** All Low / Medium-low;
no High/Critical, no data-loss, no remote-exploit.

1. **N6-C6 — crashed worker holds admin-health in `degraded` forever; no
   `stale -> offline` reaper** (Medium-low; 8-of-11-lens agreement; NOT deferrable —
   broken lifecycle invariant + unbounded dead-row accumulation + permanently
   meaningless health alarm). The worker lifecycle is
   `online -> stale -> (online | offline)`, but the `stale -> offline` edge fires
   ONLY on cooperative paths (graceful deregister `deregister/route.ts:63`; admin
   DELETE deletes the row). A SIGKILLed worker that never deregisters is marked
   `stale` by the sweep and (since cycle-5 N1) has its `active_tasks` zeroed after
   the stale-claim timeout — but the row stays `stale` forever. `admin-health.ts:89`
   returns `degraded` whenever `stale > 0`, so a single past crash pins admin
   health at degraded permanently and dead `stale` rows accumulate. This is the
   documented residual of cycle-5 N1.

   FIX: extend the existing heartbeat sweep so that, once a worker is silent past
   the stale-claim timeout, it is transitioned `stale -> offline`. Because that
   cutoff is IDENTICAL to the cycle-5 N1 active_tasks-reset cutoff, FOLD the two
   operations into ONE UPDATE:
   `SET status='offline', deregistered_at=NOW(), active_tasks=0
    WHERE status='stale' AND last_heartbeat_at < cutoff`.
   This preserves N1's active_tasks behavior exactly (a reaped row gets
   active_tasks=0; a recently-stale row within the cutoff keeps its counter AND
   stays stale). Reversible: a returning worker's next heartbeat sets
   `status='online'` unconditionally (`heartbeat/route.ts:67-73`). Add a pure
   predicate to `worker-staleness.ts` and regression tests; update the sweep +
   helper comments (DOC-C6-1).

Low / informational, no action: ICPC raw-vs-rounded `wrongBeforeAc` (cannot diverge
in practice — `verdict.ts:46` emits 2-decimal scores).

Carried deferred (ledger below, severity preserved): **F3** (worker result trust),
**F4** (≤3 worker SELECTs per claim), **N3** (failedTestCaseIndex = worker array
position), **DOC-C5-2** (register advertises hardcoded staleClaimTimeoutMs — dead
field).

---

## Implementation tasks

| # | Task | Severity | Status |
|---|---|---|---|
| 1 | In `src/lib/judge/worker-staleness.ts`, add a pure predicate `shouldMarkWorkerOffline(lastHeartbeatAt, now, staleClaimTimeoutMs)` that returns true iff `lastHeartbeatAt` is non-null AND older than `computeActiveTasksResetCutoff(now, staleClaimTimeoutMs)` (the SAME cutoff as the active_tasks reset). Document the third lifecycle transition (`stale -> offline`) in the header comment. | MED-LOW (N6-C6) — NOT DEFERRABLE | [x] commit 01e8ec07 |
| 2 | In `src/app/api/v1/judge/heartbeat/route.ts`, replace the cycle-5 N1 active_tasks-reset UPDATE (lines 104-115) with ONE combined UPDATE that, for rows `status='stale' AND last_heartbeat_at < activeTasksResetThreshold`, sets `status='offline'`, `deregisteredAt = now`, `activeTasks = 0`. Update the comment block (lines 91-101 / DOC-C6-1) to document the terminal `stale -> offline` transition and that it clears the permanent admin-health `degraded`. Behavior for active_tasks is preserved exactly; the only new effect is the status+deregisteredAt write on the same rows. | MED-LOW (N6-C6) — NOT DEFERRABLE | [x] commit 01e8ec07 |
| 3 | Extend `tests/unit/judge/worker-staleness.test.ts` with `shouldMarkWorkerOffline` cases: (a) reaped past stale-claim timeout; (b) NOT reaped when only past the 90 s stale-status floor but within the reset cutoff; (c) strict-`<` boundary; (d) `null` lastHeartbeatAt NOT reaped; (e) reap-cutoff == active_tasks-reset-cutoff invariant pinned (TE-C6-2). | MED-LOW (N6-C6 / TE-C6-1) | [x] commit 01e8ec07 (6 new cases) |
| 4 | Run all gates: `npm run lint`, `tsc --noEmit`, `npm run build`, `npm run test:unit`, `npm run lint:bash`. | — | [x] all green (2465 tests / 320 files) |
| 5 | Commit + push fine-grained, GPG-signed, conventional + gitmoji. | — | [x] 01e8ec07 + docs |
| 6 | Run per-cycle `DEPLOY_CMD` (algo flags). | — | [ ] pending |
| 7 | Housekeeping: archive the now-fully-done cycle-5 plan to `plans/done/`. | — | [x] |

---

## Quality gates

- [x] `npm run lint` — 0 errors, 0 warnings (exit 0)
- [x] `tsc --noEmit` — PASS (exit 0)
- [x] `npm run build` — PASS (exit 0)
- [x] `npm run test:unit` — PASS (320 files / 2465 tests; +6 from the 2459 baseline: new shouldMarkWorkerOffline cases)
- [x] `npm run lint:bash` — PASS (exit 0)

---

## Deferred ledger (cycle 6)

Per `plans/open/README.md` and the orchestrator deferred-fix rules, every still-open
finding is either implemented above or recorded here with severity preserved (NOT
downgraded) and a stated exit criterion. N6-C6 is NOT deferred. No
security/correctness/data-loss item is deferred without basis.

| ID | Severity | Confidence | File | Reason for deferral | Exit criterion |
|---|---|---|---|---|---|
| F3 (carried) | LOW | MEDIUM | `src/app/api/v1/judge/poll/route.ts:134`; `src/lib/judge/verdict.ts:39-46` | Worker result trust: `score = passed/results.length`; `testCaseId` FK-constrained but not scoped to the claimed problem. Gated by claimToken ownership + per-worker secret + IP allowlist (trusted-worker model). Trust model UNCHANGED this cycle; the fix adds a poll hot-path query and defends only against a compromised trusted worker. Severity preserved. | Re-open if untrusted/third-party workers become possible, OR a worker bug is observed inflating scores in prod. Then validate reported `testCaseId`s ∈ the claimed problem's test-case set and compare `results.length` to the problem's test-case count before scoring. |
| F4 (carried) | LOW | MEDIUM | `src/app/api/v1/judge/claim/route.ts:130,143-150,298-306`; `src/lib/judge/auth.ts:62` | Up to 3 SELECTs of the same `judge_workers` row per claim (auth helper + pre-claim check + no-claim-branch capacity check). Bounded by worker count on a tiny indexed table; the atomic claim CTE is the real gate. No measurable cost / no profiling signal. | Re-open if the claim path appears in DB profiling, or fold into a refactor that returns the auth-helper's already-fetched worker row. |
| N3 (carried) | LOW | MEDIUM (informational) | `src/lib/judge/verdict.ts:22-31`; `src/components/submission-status-badge.tsx` | `failedTestCaseIndex` is the worker-supplied array position displayed as the failing test ordinal; alignment with the problem's `sortOrder` is a worker-contract assumption, gated by the same trusted-worker boundary as F3. Not a confirmed defect under the current trust model. | Re-open together with F3 if untrusted/third-party workers become possible, OR if a mis-ordered index is observed in production. Then map reported `testCaseId`s back to `sortOrder` server-side before computing `failedTestCaseIndex`. |
| DOC-C5-2 (carried) | LOW | HIGH (non-impacting) | `src/app/api/v1/judge/register/route.ts:22,75`; `judge-worker-rs/src/types.rs` | The register response advertises hard-coded `staleClaimTimeoutMs = 300_000` while the claim route enforces the admin-configurable `getConfiguredSettings().staleClaimTimeoutMs`. VERIFIED the Rust worker only deserializes this field and never reads it for any logic, so the advertised value is a dead field — behavioral impact nil. | Re-open when the register route is next touched, OR if the worker ever starts consuming the advertised timeout. Then advertise the live `getConfiguredSettings().staleClaimTimeoutMs`, or remove the dead field. |

### Carried-over from cycle-3 ledger (still open — NOT re-counted as cycle-6 new)
F3-cycle3 (bulk-recruiting email divergence — product decision), F4-cycle3
(`hashConfig` cleartext, in-memory only), F5-cycle3 (per-send config resolution),
F6-cycle3 (SMTP UX polish), F7-cycle3 (provider-name staleness), F8-cycle3
(advisory locks / deep-clone). All remain valid in the archived
`plans/done/2026-05-29-cycle-3-rpf-review-remediation.md` with their exit criteria.

---

## Progress

- [x] Per-agent reviews written (`.context/reviews/cycle-6-2026-05-29/`, 11 lenses)
- [x] Aggregate written (`.context/reviews/_aggregate.md` + `_aggregate-cycle-6-2026-05-29.md`; cycle-5 preserved as `_aggregate-cycle-5-2026-05-29.md`)
- [x] Plan written
- [x] Cycle-5 plan archived to `plans/done/` (fully implemented + deployed)
- [x] N6-C6 implemented (pure predicate + combined sweep UPDATE) + tests — commit 01e8ec07
- [x] Gates green (lint 0/0, tsc 0, build 0, 2465 unit tests / 320 files, lint:bash 0)
- [x] Committed (fine-grained, GPG-signed): 01e8ec07
- [ ] Pushed to main
- [ ] Deployed (per-cycle)
