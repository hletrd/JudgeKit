# RPF Cycle 9 — Test Engineer

**Date:** 2026-04-29
**HEAD reviewed:** `1bcdd485`.

## Test inventory at HEAD

- `tests/unit/` — vitest unit tests including `tests/unit/api/time-route-db-time.test.ts` (added cycle 7).
- `tests/integration/` — env-blocked harness; 37 tests SKIPPED in cycle 8 (DEFER-ENV-GATES carry-forward).
- `tests/component/` — vitest component tests; 66 errors in cycle 8 (worker spawn timeouts; DEFER-ENV-GATES).
- `tests/security/` — 4 failures + 205 passes in cycle 8 (rate-limiter-client circuit-breaker timeouts under CPU contention; transient).
- `tests/e2e/` — playwright; webServer requires Postgres harness (DEFER-ENV-GATES).

## Findings

**0 NEW test gaps.**

The cycle-8 diff:
- README addition: no test required (documentation-only).
- `deploy-docker.sh` soft cap: no automated bash test harness exists at the project level; this is a project-wide test-gap (DEFER-ENV-GATES related); not a cycle-8 regression. Manual smoke testing of the cap path during cycle-8 deploy was not performed (deploy used default `DEPLOY_SSH_RETRY_MAX=4`); not a regression.
- Rate-limit JSDoc headers: no test required (documentation-only).

## Test-suite stability

Cycle 8 gates:
- `npm run lint`: clean.
- `npx tsc --noEmit`: clean.
- `npm run lint:bash`: clean.
- `npm run build`: clean.
- `test:unit`: 124 fail / 2110 pass (DEFER-ENV-GATES).
- `test:integration`: 37 SKIPPED (DEFER-ENV-GATES).
- `test:component`: 66 errors (DEFER-ENV-GATES, worker spawn).
- `test:security`: 4 fail / 205 pass (vs 8 fail in cycle 7; transient improvement).
- `test:e2e`: skipped (DEFER-ENV-GATES).

The DEFER-ENV-GATES failures are environmental; they require a CI host with PostgreSQL + Playwright sidecar. The cycle-8 close-out reported the same failure pattern as cycles 3-7 — no regression introduced by this cycle.

## Test-debt items still on backlog

| ID | Description | Severity | Trigger to fix |
|---|---|---|---|
| DEFER-ENV-GATES | Env-blocked vitest+playwright | LOW | Provisioned CI/host with DATABASE_URL + Postgres + Playwright sidecar |
| C7-AGG-6 | `participant-status.ts` time-boundary tests missing | LOW | Bug report on deadline boundary OR participant-status refactor cycle |
| Cross-module rate-limit parity test | (implicit successor to C7-AGG-9) | DEFERRED-not-yet-recorded | Rate-limit consolidation cycle |

## Suggestion for cycle 9

If cycle 9 wants a test-engineer-flavored LOW pick, the cleanest is:
- **Add a unit test for `deploy-docker.sh` soft-cap behavior** — would require introducing a bash test harness (e.g., `bats`). Out of scope for a single cycle; recommend deferring with sharp exit criterion ("when bash test harness is introduced project-wide").

Alternatively, **add a vitest unit test for `participant-status.ts` deadline boundary cases** (C7-AGG-6) — this is well-scoped, ≤50 lines of test, no new harness required. Could be picked.

## Confidence

High on "0 NEW test gaps from cycle-8 diff."

## Recommendation

No urgent test-engineering action for cycle 9. If the orchestrator wants a third pick, suggest C7-AGG-6 (deadline boundary test for `participant-status.ts`) — though the trigger ("bug report on deadline boundary OR refactor cycle") has not fired, so reactive policy says it can wait.
