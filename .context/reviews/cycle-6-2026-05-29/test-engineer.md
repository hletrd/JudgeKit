# Cycle 6 — Test-engineer review (coverage gaps, TDD)

**HEAD:** d1217b5a · Baseline 2459 tests / 320 files green.

## Findings

### TE-C6-1 — no coverage for `stale -> offline` reaping (N6-C6) — **MEDIUM-LOW**
`tests/unit/judge/worker-staleness.test.ts` covers `computeStaleStatusCutoff`, `computeActiveTasksResetCutoff`, and `shouldResetActiveTasks`, but there is no predicate or test for transitioning a crashed worker to `offline`. When N6-C6 is implemented, add a pure reaper predicate to `worker-staleness.ts` and assert:
- a worker silent PAST the stale-claim timeout is eligible to be reaped to `offline`;
- a worker only past the 90 s stale-status floor (but within the reset cutoff) is NOT reaped (stays `stale`, keeps `active_tasks`);
- exact-boundary (strict `<`) behavior;
- `lastHeartbeatAt === null` is NOT reaped (freshly registered, no heartbeat yet).
These mirror the existing `shouldResetActiveTasks` cases, so the harness is already established.

### TE-C6-2 — reaper-cutoff == reset-cutoff invariant should be pinned — **LOW**
Add an assertion that the offline-reap cutoff equals the active_tasks-reset cutoff (so the combined single-UPDATE refactor can never drift the two thresholds apart in a future edit).

### Existing gaps (carried, not re-counted)
AGG3-4 CodeTimelinePanel component test; getAssignmentStatusRows integration test (C1-TE-2); Playwright browser dependency (C1-TE-3). All previously deferred.

## Final sweep
No flaky tests observed in the 31.8 s unit run. The judge-route handlers are integration-tested behind a DB; the pure-helper extraction pattern (worker-staleness.ts) is the correct TDD seam — continue it for the reaper.
