# Cycle 5 RPF Review Remediation Plan

**Date:** 2026-05-29
**Cycle:** 5/100 of this RPF loop (orchestrator-numbered)
**Aggregate:** `.context/reviews/_aggregate.md` (cycle-5) + `_aggregate-cycle-5.md`
**Per-agent reviews:** `.context/reviews/cycle-5-2026-05-29/{code-reviewer,perf-reviewer,security-reviewer,critic,verifier,test-engineer,tracer,architect,debugger,document-specialist,designer}.md`
**Prior-cycle aggregates preserved:** `.context/reviews/_aggregate-cycle-4.md`, `_aggregate-cycle-3.md`, `_aggregate-cycle-2-2026-05-29.md`, `_aggregate-cycle-1-2026-05-29.md`

---

## Summary

Cycle 5 broadened the review onto the judge-worker LIFECYCLE + SCHEDULING
(register / heartbeat / deregister / claim / poll), the DB-backed rate limiter,
contest scoring (IOI/ICPC + SWR cache), and the Rust worker crate. Baseline fully
green (lint 0/0, tsc 0, test:unit 319 files / 2450 tests, lint:bash 0).

**2 net-new actionable findings (both implement now), 2 informational deferred, 2
carried deferred (F3/F4, severity preserved).** All Low / Medium-low; no
High/Critical, no data-loss, no remote-exploit.

1. **N1 — crashed-worker `active_tasks` is never reconciled** (Medium-low; 11-angle
   agreement; NOT deferrable — broken invariant + sticky degraded health). The
   heartbeat staleness sweep (`heartbeat/route.ts:82-89`) marks lapsed workers
   `stale` but never zeroes `active_tasks`; only graceful deregister / admin DELETE
   do. A SIGKILLed worker leaves an orphaned row with phantom `active_tasks`. Blast
   radius is bounded (restarts register fresh rows; the claim CTE filters
   `status='online'`, so no self-lockout / no phantom capacity theft), BUT
   `admin-health.ts:89` reports `degraded` while any worker is `stale` with no
   reaper, so a single crash keeps health degraded indefinitely, and orphaned rows
   accumulate unbounded. FIX: in the sweep, also `active_tasks = 0` for rows marked
   stale — ONLY when `last_heartbeat_at` is older than the **stale-claim timeout**
   (`getConfiguredSettings().staleClaimTimeoutMs`, default 300 s), not the 90 s
   stale threshold, so a transiently-slow-but-live worker's counter is never
   corrupted. Add a regression test (zero-past-timeout + no-clobber-recent-stale).
2. **N2 — `consumeUserApiRateLimit` called with a non-user scope** (Low;
   maintainability). `claim/route.ts:121` passes an IP/auth/worker scope as the
   `userId` param, yielding misleading keys like `api:judge:claim:user:ip:1.2.3.4`.
   Functionally correct. FIX: rename the param to `scope`/`identity` and update the
   JSDoc; no behavior change.

Deferred (ledger below, severity preserved): **N3** (failedTestCaseIndex = worker
array position; folds under F3), **DOC-C5-2** (register advertises hard-coded
staleClaimTimeoutMs — verified dead field, worker never reads it), and carried
**F3** (worker result trust — trust model unchanged) and **F4** (triple worker
SELECT — no profiling signal).

---

## Implementation tasks

| # | Task | Severity | Status |
|---|---|---|---|
| 1 | In `src/app/api/v1/judge/heartbeat/route.ts`, extend the staleness sweep (lines 82-89) so that workers being marked `stale` whose `last_heartbeat_at` is older than the configured stale-claim timeout ALSO get `active_tasks = 0`. Read the timeout via `getConfiguredSettings().staleClaimTimeoutMs` (import `getConfiguredSettings`). Keep the existing 90 s `online → stale` threshold for the status flip; only the counter-zeroing uses the longer stale-claim timeout. Update the file comment to state how a dead worker's counter is reconciled. | MED-LOW (N1) — NOT DEFERRABLE | [x] commit 9250635b (helper `src/lib/judge/worker-staleness.ts` + sweep) |
| 2 | Add a unit test (`tests/unit/judge/` — new `heartbeat-sweep.test.ts` or extend an existing harness) asserting: (a) a worker stale past the stale-claim timeout gets `active_tasks` zeroed by the sweep; (b) a worker recently stale (past 90 s but within the stale-claim timeout) keeps its `active_tasks` (no clobber of live in-flight work). If the route is not unit-testable in isolation, factor the sweep predicate into a small pure helper in `src/lib/judge/` and test that. | MED-LOW (N1 / TE-C5-1) | [x] commit 9250635b (`tests/unit/judge/worker-staleness.test.ts`, 9 cases) |
| 3 | In `src/lib/security/api-rate-limit.ts`, rename the `userId` parameter of `consumeUserApiRateLimit` to `scope` (or `identity`) and update the JSDoc to state it accepts any stable per-caller identity (userId, `ip:<ip>`, `auth:<hash>`, workerId). No key-format change (keep `api:${endpoint}:user:${scope}` for backward compatibility — existing buckets must not reset). Update the call site comment in `claim/route.ts` if helpful. | LOW (N2 / CR-C5-2) | [x] commit 9bf5a018 |
| 4 | Run all gates: `npm run lint`, `tsc --noEmit`, `npm run build`, `npm run test:unit`, `npm run lint:bash`. | — | [x] all green |
| 5 | Commit + push fine-grained per-topic, GPG-signed, conventional + gitmoji. | — | [x] 9250635b, 9bf5a018, 2913ffd1 |
| 6 | Run per-cycle `DEPLOY_CMD` (algo flags). | — | [ ] |
| 7 | Housekeeping: archive the now-fully-done cycle-3 and cycle-4 plans to `plans/done/` (done in this cycle's planning pass). | — | [x] |

> NOTE on key compatibility (task 3): the rate-limit key template MUST remain
> `api:${endpoint}:user:${scope}` even after the param rename, so that in-flight
> buckets in the `rate_limits` table are not orphaned/reset on deploy. The rename is
> identifier-only; the `user:` literal in the key string stays. This is the smallest
> safe change that addresses the maintainability finding without a behavior change.

---

## Quality gates

- [x] `npm run lint` — 0 errors, 0 warnings (exit 0)
- [x] `tsc --noEmit` — PASS (exit 0)
- [x] `npm run build` — PASS (exit 0; all routes compiled)
- [x] `npm run test:unit` — PASS (320 files / 2459 tests; +1 file / +9 from the 319/2450 baseline: the new worker-staleness.test.ts)
- [x] `npm run lint:bash` — PASS (exit 0)

---

## Deferred ledger (cycle 5)

Per `plans/open/README.md` and the orchestrator deferred-fix rules, every still-open
finding is either implemented above or recorded here with severity preserved (NOT
downgraded) and a stated exit criterion. N1 and N2 are NOT deferred. No
security/correctness/data-loss item is deferred without basis.

| ID | Severity | Confidence | File | Reason for deferral | Exit criterion |
|---|---|---|---|---|---|
| N3 (DBG-N3) | LOW | MEDIUM (informational) | `src/lib/judge/verdict.ts:22`; `src/components/submission-status-badge.tsx` | `failedTestCaseIndex` is the worker-supplied array position, displayed as the failing test ordinal; alignment with the problem's `sortOrder` is a worker-contract assumption, not enforced server-side. Gated by the trusted-worker boundary (per-worker secret + claimToken + IP allowlist) — same boundary as F3. Not a confirmed defect under the current trust model. | Re-open together with F3 if untrusted/third-party workers become possible, OR if a mis-ordered index is observed in production. Then map reported `testCaseId`s back to `sortOrder` server-side before computing `failedTestCaseIndex`. |
| DOC-C5-2 (DOC-C5-2) | LOW | HIGH (non-impacting) | `src/app/api/v1/judge/register/route.ts:22,75`; `judge-worker-rs/src/types.rs:311` | The register response advertises a hard-coded `staleClaimTimeoutMs = 300_000` while the claim route enforces the admin-configurable `getConfiguredSettings().staleClaimTimeoutMs`. VERIFIED the Rust worker only deserializes this field and never reads it for any logic, so the advertised value is a dead field — behavioral impact nil. Authoritative reclaim is server-side via the live setting. | Re-open when the register route is next touched, OR if the worker ever starts consuming the advertised timeout. Then advertise `getConfiguredSettings().staleClaimTimeoutMs` (the live value), or remove the dead field. |
| F3 (carried from cycle-4 ledger) | LOW | MEDIUM | `src/app/api/v1/judge/poll/route.ts:96-103,161-166`; `src/lib/judge/verdict.ts:39-68` | Worker result trust: `testCaseId` FK-constrained to `test_cases` (blocks fabricated IDs) but not scoped to the claimed problem; `score = passed/results.length` lets a partial set inflate the score. Gated by claimToken ownership + per-worker secret + IP allowlist (trusted-worker model). Trust model UNCHANGED this cycle; the fix adds a poll hot-path query and defends only against a compromised trusted worker. critic + security agree NOT actionable now. Severity preserved. | Re-open if/when untrusted/third-party workers become possible, OR a worker bug is observed inflating scores in prod. Then validate reported `testCaseId`s ∈ the claimed problem's test-case set and compare `results.length` to the problem's test-case count before scoring. |
| F4 (carried from cycle-4 ledger) | LOW | MEDIUM | `src/app/api/v1/judge/claim/route.ts:130,143-150,298-306` | Up to 3 SELECTs of the same `judge_workers` row per claim. Bounded by worker count; the atomic claim CTE is the real gate. No measurable cost / no profiling signal. | Re-open if the claim path appears in DB profiling, or fold into a refactor that returns the auth-helper's already-fetched worker row. |

### Carried-over from cycle-3 ledger (still open — NOT re-counted as cycle-5 new)
F3-cycle3 (bulk-recruiting email divergence — product decision), F4-cycle3
(`hashConfig` cleartext, in-memory only), F5-cycle3 (per-send config resolution),
F6-cycle3 (SMTP UX polish), F7-cycle3 (provider-name staleness), F8-cycle3
(advisory locks / deep-clone). All remain valid in the archived
`plans/done/2026-05-29-cycle-3-rpf-review-remediation.md` with their exit criteria.

---

## Progress

- [x] Per-agent reviews written (`.context/reviews/cycle-5-2026-05-29/`)
- [x] Aggregate written (`.context/reviews/_aggregate.md` + `_aggregate-cycle-5.md`; prior preserved)
- [x] Plan written
- [x] Cycle-3 + cycle-4 plans archived to `plans/done/` (both fully implemented + deployed)
- [x] N1 implemented (sweep zeroes active_tasks past stale-claim timeout) + tests — commit 9250635b
- [x] N2 implemented (rate-limit param rename, key format preserved) — commit 9bf5a018
- [x] Gates green (lint 0, tsc 0, build 0, 2459 unit tests, lint:bash 0)
- [x] Committed (fine-grained, GPG-signed): 9250635b, 9bf5a018, 2913ffd1
- [x] Pushed to main (527931f7..b59dde3e)
- [ ] Deployed (per-cycle) — in progress
