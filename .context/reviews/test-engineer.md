# Test Engineer — RPF Cycle 1 (2026-06-11)

**HEAD reviewed:** f977ef4c. Baseline: 330 files / 2551 unit tests, all green
on this HEAD (re-run this cycle). +79 tests vs cycle-9.

## Coverage assessment of the delta
Every remediation commit shipped with tests (verified by reading them, not the
checkmarks): claim reclaim guard (`tests/unit/judge/claim-query.test.ts`,
+ DB-backed `tests/integration/db/judge-claim-reclaim.test.ts`), IOI run-all
(`ioi-run-all-tests-implementation.test.ts` — drives the truncated worker shape
through scoring), retention (`data-retention-maintenance.test.ts`), draft route
(`problem-draft.route.test.ts`, 6 cases), draft hook
(`use-server-source-draft.test.ts`, 98 lines incl. the never-clobber cases),
staleness sweep (`worker-staleness-sweep.test.ts`), a11y guards
(`a11y-review-fixes-implementation.test.ts`), settings overrides
(`system-settings.test.ts` +85 lines).

## Gaps (NEW findings)

### T1 — No test for the SELF-reclaim active_tasks path (MEDIUM, confidence High)
`claim-query.test.ts:` structural tests assert `prev_worker_release` exists and
excludes `@workerId`, but no test (unit-structural or integration) covers the
same-worker reclaim accounting — which is exactly where the live leak hides
(code-reviewer CR1). The DB-backed `judge-claim-reclaim.test.ts` exercises
distinct-worker reclaim only. When CR1 is fixed, add: (a) structural assertion
that `worker_bump` compensates the self-case; (b) an integration case
(same worker id reclaims its own stale row → active_tasks unchanged net).

### T2 — Draft route: no negative test for junk `language` (LOW→same fix as S1, confidence High)
`problem-draft.route.test.ts` covers auth/authz/size-cap/upsert/delete but
accepts any language string. Once S1 (registry validation) lands, add a 400
case for an unknown language and keep a happy case for a real one.

### T3 — No guard test mapping app routes → CSP matcher (LOW, confidence High)
The repo's source-grep-guard idiom (`tests/unit/infra/source-grep-inventory.test.ts`)
fits A1/S2 perfectly: enumerate `src/app/{(public),(auth),change-password}/**`
top-level segments and assert each appears in `proxy.ts` config.matcher. Would
have caught both prior CSP regressions at commit time.

### T4 — `verify-db-backup.sh` restore-test has no CI exercise (LOW, env-bound)
The restore path needs a Postgres; falls under carried DEFER-ENV-GATES (no
provisioned CI DB). Re-defer with that item; do not fake it with mocks.

## Flakiness / hygiene
- Unit run is deterministic (38.9 s, no retries seen). The pino error noise in
  the run log (`contests.route.test.ts` "crash" stack traces) is *intentional*
  error-path coverage writing through the real logger — cosmetic, but it makes
  real failures harder to spot in CI logs. Consider silencing the logger in
  those specific tests via the existing test logger shim (LOW, hygiene).
- `tests/integration/db/*` (incl. the new reclaim suite) remain env-gated;
  documented and acceptable (DEFER-ENV-GATES).

## TDD opportunities for this cycle's fixes
Write T1's structural assertion BEFORE changing `buildClaimSql` (red→green),
and T2's 400 case BEFORE adding the language guard. Both are cheap and pin the
exact regression class.

## Final sweep
Checked for masking tests (the verdict.test.ts class fixed in C1 — no new
hand-built result arrays that bypass the worker shape), over-mocked routes
(b38062ae correctly mocks getEffectiveModeRestrictions where the real DB isn't
available), and orphaned snapshots (none). Done.
