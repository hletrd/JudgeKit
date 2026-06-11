# Debugger Review — Cycle 5 (2026-05-29)

Scope this cycle (per orchestrator): broaden onto judge worker scheduling /
result-trust, worker lifecycle (register/heartbeat/deregister/claim/poll),
rate limiter, contest scoring, and the Rust worker crate.

## Inventory examined
- `src/app/api/v1/judge/{claim,poll,register,heartbeat,deregister}/route.ts`
- `src/app/api/v1/admin/workers/{route,[id]/route,stats/route}.ts`
- `src/lib/judge/{verdict,auth,ip-allowlist}.ts`
- `src/lib/security/api-rate-limit.ts`
- `src/lib/assignments/contest-scoring.ts`
- `src/lib/db/schema.pg.ts` (judge_workers, submission_results)
- `judge-worker-rs/src/{main,api}.rs`

## Findings

### N1 — Crashed-worker `active_tasks` is never reset (Medium-low / High-confidence mechanism)
`heartbeat/route.ts:82-89` runs a staleness sweep that flips `online → stale` for
workers whose `last_heartbeat_at` is older than `HEARTBEAT_INTERVAL_MS *
STALE_MULTIPLIER` (90 s). It sets **only** `status: "stale"` — it never resets
`active_tasks`. The ONLY place `active_tasks` is reset to 0 is the graceful
`deregister` path (`deregister/route.ts:65`) and the admin `DELETE`
(`admin/workers/[id]/route.ts`). A worker that crashes (SIGKILL / OOM / host
loss) without deregistering leaves an orphaned row with a non-zero `active_tasks`.

Failure scenario: worker at `active_tasks=4/concurrency=4` is killed. Its 4
in-flight submissions are reclaimed by the stale-claim path
(`claim/route.ts:193-195`) — good. But the dead worker's row stays at
`active_tasks=4` forever. Mitigating factors that bound severity:
- The Rust worker calls `register()` on every startup (`main.rs:233-246`) and the
  register route always INSERTs a NEW row (`register/route.ts:49-64`), so a
  restarted worker comes back as a fresh `active_tasks=0` row. The leaked counter
  sits on the abandoned `stale` row, which the claim CTE's `status = 'online'`
  gate (`claim/route.ts:182`) never selects.
- The worker dashboard sums `active_tasks` only over `online` workers
  (`dashboard-data.ts:54`), so the live-capacity metric is not inflated.

Residual impact (why it is still a finding):
1. Orphaned `stale` rows accumulate indefinitely — there is no reaper that marks
   long-stale workers `offline` or releases/zeroes them. `admin-health.ts:89`
   flips system health to `degraded` whenever `stale > 0`, so a single crashed
   worker keeps the health endpoint degraded until an admin manually
   force-removes it (`admin/workers/[id]` DELETE).
2. The `judge_workers_active_tasks_nonneg` CHECK only guards the lower bound; an
   orphaned high value is schema-legal and silently misleading on the admin table
   (`workers-client.tsx:376` shows the stale row's stale `active_tasks`).

Suggested fix (low-risk, no new hot-path query): in the heartbeat sweep, when
marking a worker `stale`, also `active_tasks = 0` for that same row IF it has been
stale long enough that any in-flight claim must already have been reclaimed
(i.e. heartbeat older than the stale-claim timeout, not just the stale threshold).
Alternatively add an admin "reap offline workers" action that sets long-stale rows
to `offline` and zeroes their counters. Either keeps the health signal honest.

### N2 — `consumeUserApiRateLimit` called with a non-user scope (Low / maintainability)
`claim/route.ts:121` passes `rateLimitScope` (which is `workerId`, or `ip:<ip>`,
or `auth:<hash>` — see lines 106-120) as the `userId` argument of
`consumeUserApiRateLimit`, whose key template is `api:${endpoint}:user:${userId}`
(`api-rate-limit.ts:190`). For the IP/auth fallbacks this yields keys like
`api:judge:claim:user:ip:1.2.3.4`. Functionally correct (distinct buckets, no
collisions), but the `user:` infix is misleading for a non-user identity and will
confuse anyone grepping `rate_limits` during an incident. Suggest renaming the
parameter to `scope`/`identity` or documenting the overload at the call site.

### N3 — `failedTestCaseIndex` is worker-array-position, displayed as the failing ordinal (Low / informational)
`verdict.ts:22` (`extractFinalJudgeDetail`) returns `results.findIndex(...)` — the
position in the worker-supplied `results` array. The claim route sends test cases
ordered by `sortOrder` (`claim/route.ts:400`), and the worker is expected to judge
and report in that order, so the index lines up with the displayed "failed at test
case N" (`submission-status-badge.tsx`). This alignment is a worker-contract
assumption, not enforced server-side. Folds under the F3 trusted-worker boundary
(carried deferred); no action this cycle.

## Re-validation of carried-over deferred items
- **F3** (worker result trust: testCaseId not problem-scoped; `score =
  passed/results.length` lets a partial set inflate score): still gated by
  claimToken ownership + per-worker secret + IP allowlist. Implementing
  problem-scoped testCaseId validation + result-count check would add a hot-path
  query the cycle-4 critic explicitly cautioned against, under an UNCHANGED trust
  model. Correctly remains deferred (exit criterion unchanged).
- **F4** (triple `judge_workers` SELECT on claim): still bounded by worker count,
  no profiling signal. Remains deferred.

## Final sweep
No data-loss, no crash, no unhandled-rejection found in the reviewed paths. The
contest-scoring SWR refresh (`contest-scoring.ts:159-182`) correctly guards
unhandled rejections with the IIFE-`.catch` belt-and-suspenders pattern. N1 is the
only net-new mechanism worth a low-risk fix.
