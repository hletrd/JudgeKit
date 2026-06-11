# Test Engineer — Cycle 5 (2026-05-29)

Angle: coverage gaps, regression opportunities.

## Existing coverage (verified)
- `tests/unit/judge/verdict.test.ts` — thorough for `computeFinalJudgeMetrics`,
  `extractFinalJudgeDetail`, `buildSubmissionResultRows` (incl. rounding edges).
- `tests/unit/judge/auth.test.ts`, `ip-allowlist.test.ts` — present.
- Baseline this cycle: 319 files / 2450 tests, all green.

## TE-C5-1 (= N1) — no test for the worker-staleness `active_tasks` invariant
There is no unit/integration test asserting that a stale/crashed worker's
`active_tasks` is reconciled. When N1 is fixed (sweep zeroes `active_tasks` past
the stale-claim timeout, or a reaper), add a test that:
- a worker marked `stale` with a heartbeat older than the stale-claim timeout has
  its `active_tasks` reset to 0 by the sweep; and
- a worker that is merely `stale` but recently heartbeated (transient blip) does
  NOT get its in-flight `active_tasks` clobbered.
This guards against both the leak and an over-aggressive fix that would corrupt a
live worker's counter. Recommend adding alongside the N1 fix.

## TE-C5-2 (= N2) — none required
Pure rename/doc; existing rate-limit tests already cover bucket isolation.

## F3 (carried, deferred) — test gap acknowledged
If/when F3 is picked up (untrusted workers), add tests for testCaseId-set scoping
and result-count-vs-problem-count score validation. Not actionable this cycle.

Net-new: TE-C5-1 (= N1, implement with the fix).
