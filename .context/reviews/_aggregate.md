# Aggregate Review — Cycle 5 (2026-05-29)

Per-agent reviews live in `.context/reviews/cycle-5-2026-05-29/` (one file per
specialist angle). Prior aggregates preserved verbatim at
`.context/reviews/_aggregate-cycle-4.md`, `_aggregate-cycle-3.md`,
`_aggregate-cycle-2-2026-05-29.md`, `_aggregate-cycle-1-2026-05-29.md`.

## Environment note (review fan-out)
This environment exposes NO reviewer-style subagents (`.claude/agents/` empty, no
`~/.claude/agents/`) and the only dispatchable agent type is `general-purpose`. Per
the prompt's "skip any not registered" rule (and consistent with cycles 1-4), the
review was conducted directly across all 11 specialist angles, one provenance file
per angle: code-reviewer, perf-reviewer, security-reviewer, critic, verifier,
test-engineer, tracer, architect, debugger, document-specialist, designer (web UI
present → designer included).

## Scope this cycle (per orchestrator)
Broadened onto judge worker SCHEDULING + result-trust and the full worker
LIFECYCLE: register / heartbeat / deregister / claim / poll routes, `judge/auth`,
`judge/verdict`, admin worker routes, the DB-backed rate limiter, contest scoring
(IOI/ICPC + SWR cache), and the Rust worker crate (`judge-worker-rs`). Also
re-validated the cycle-4 deferred items F3 (worker result trust) and F4 (triple
worker SELECT) for actionability.

## Gate baseline (whole repo, verified this cycle)
`npm run lint` = 0 errors / 0 warnings · `tsc --noEmit` = 0 · `npm run lint:bash` =
0 · `npm run test:unit` = 319 files / 2450 tests, all pass. (`npm run build`
unchanged inputs from cycle-4 green; re-run before deploy.)

## Merged findings (deduped; cross-agent agreement noted)

### N1 [DBG-N1 / ARCH-C5-1 / CR-C5-1 / SEC-C5-1 / PERF-C5-1 / VER-C5-1+2 / TRACE-Hyp-C / DOC-C5-1 / DSN-C5-1 / TE-C5-1 / critic] — Medium-low / High-confidence mechanism — IMPLEMENT THIS CYCLE
**Crashed-worker `active_tasks` is never reconciled.** The heartbeat staleness
sweep (`src/app/api/v1/judge/heartbeat/route.ts:82-89`) flips `online → stale` for
workers whose heartbeat lapses, setting ONLY `status: "stale"`. It never resets
`active_tasks`. The ONLY paths that zero `active_tasks` are graceful deregister
(`deregister/route.ts:65`) and admin DELETE. A worker killed without deregistering
(SIGKILL / OOM / host loss) leaves an orphaned row with a non-zero `active_tasks`.

AGREEMENT: 11 angles. EMPIRICALLY traced: all five `active_tasks` write sites
enumerated (claim +1, claim-rollback -1, poll-final -1, deregister =0, admin DELETE
row-removed); the sweep is the only degradation edge and it omits the counter.

Blast radius (bounded — why Medium-LOW, not High):
- Restarted workers `register()` afresh → new row, `active_tasks=0`
  (`main.rs:233`, `register/route.ts:49` always INSERTs). NO self-lockout.
- The claim CTE gates `status='online'` (`claim/route.ts:182`), so a stale row's
  leaked counter is invisible to scheduling. NO phantom capacity theft.
- The live-capacity dashboard sums only `online` rows (`dashboard-data.ts:54`).
Real residual harm (CONFIRMED): (a) `admin-health.ts:89` reports `degraded` while
`stale > 0`, and there is no reaper → a single crashed worker keeps health
degraded indefinitely; (b) orphaned rows accumulate unbounded (register always
INSERTs); (c) the admin workers table shows phantom `active_tasks` on dead rows.

FIX (constrained by critic + verifier): in the heartbeat sweep, ALSO set
`active_tasks = 0` for rows being marked stale — but ONLY for rows whose
`last_heartbeat_at` is older than the **stale-claim timeout**
(`getConfiguredSettings().staleClaimTimeoutMs`, default 300 s), NOT the mere
90 s stale threshold. By the stale-claim timeout any in-flight claim has provably
been reclaimed (`claim/route.ts:193-195`), so zeroing is safe; zeroing on the 90 s
threshold alone would corrupt a transiently-slow-but-live worker that is still
doing real work and about to heartbeat back to `online`. Add a regression test
asserting both the zero-past-timeout case and the no-clobber recent-stale case.
NOT deferrable (correctness of a documented invariant + sticky health degradation).

### N2 [CR-C5-2 / ARCH-C5-2] — Low / maintainability — IMPLEMENT THIS CYCLE (cosmetic)
`claim/route.ts:121` passes a generic scope (`workerId` | `ip:<ip>` | `auth:<hash>`)
as the `userId` argument of `consumeUserApiRateLimit`
(`api-rate-limit.ts:185-209`), producing rate-limit keys like
`api:judge:claim:user:ip:1.2.3.4`. Functionally correct (distinct buckets, no
collision) but the `user:` infix is misleading for non-user identities and will
confuse `rate_limits` triage. FIX: rename the parameter to `scope`/`identity` (it is
already used generically) and update the JSDoc; no behavior change. Low.

### N3 / DOC-C5-2 [DBG-N3 / DOC-C5-2] — Low / informational (NOT implementing this cycle)
- N3: `failedTestCaseIndex` (`verdict.ts:22`) is the worker-supplied array position,
  displayed to users as the failing test ordinal; relies on the worker reporting in
  `sortOrder`. Trust-gated; folds under F3.
- DOC-C5-2: `register/route.ts:22,75` advertises a hard-coded
  `staleClaimTimeoutMs = 300_000` while the claim route uses the admin-configurable
  `getConfiguredSettings().staleClaimTimeoutMs`. VERIFIED the Rust worker only
  deserializes this field (`types.rs:311`) and never reads it for logic → the
  advertised value is effectively dead; behavioral impact nil. Informational only;
  note for a future register-route touch (advertise the live setting or document the
  field as informational). Recorded as deferred (see ledger).

## Re-validation of cycle-4 deferred items (orchestrator asked: implement if actionable)
- **F3** (worker result trust): trust model UNCHANGED this cycle. The fix
  (problem-scoped testCaseId set + result-count-vs-problem-count validation) adds a
  poll hot-path query and defends only against a compromised TRUSTED worker — the
  exact threat the cycle-4 exit criterion gates on ("untrusted/third-party workers
  become possible"). critic + security agree: NOT actionable; remains DEFERRED,
  severity preserved (LOW/MEDIUM).
- **F4** (triple `judge_workers` SELECT on claim): no profiling signal; bounded by
  worker count. Remains DEFERRED, perf-only.

## Severity roll-up (net-new only)
- Medium-low (implement now): **N1** (11-angle agreement, highest-signal net-new).
- Low (implement now, cosmetic): **N2** (rate-limit param rename).
- Low / informational (deferred): **N3** (folds under F3), **DOC-C5-2** (dead
  advertised field).
- No High/Critical, no data-loss, no remote-exploit findings.

## AGENT FAILURES
None. No subagents were spawnable in this environment (see Environment note); all
11 specialist angles were covered directly, one provenance file per angle in
`cycle-5-2026-05-29/`.
