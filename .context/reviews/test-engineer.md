# Test-engineer review — RPF cycle 4 (2026-06-11)

**HEAD reviewed:** 7c0a4bd4 · unit 336 files / 2597 tests PASS · component
70 files / 234 tests PASS (cycle-3 record; re-run scheduled with this cycle's
fixes).
**Lens:** coverage gaps, flaky tests, TDD opportunities.

## TE4-1 — The fail-open flag path has ZERO tests (HIGH-value gap, High confidence, CONFIRMED)
`grep validateAssignmentSubmission tests/` →
`tests/unit/assignments/submissions.test.ts` covers schedule/enrollment/
exam-window branches (13 cases) but NOT the anti-cheat heartbeat correlation
block (`submissions.ts:319-362`): no test that a stale heartbeat inserts the
flag, that a fresh heartbeat doesn't, that insert failure fails open
(the `.catch` at `:355`), or that the freshness probe ignores server-inserted
event types. The cycle's principal fixes (AGG4-1/AGG4-2) land exactly here —
write the red-first suite:
1. submit-path + stale → flag inserted once (values asserted);
2. submit-path + fresh client event → no insert;
3. submit-path + ONLY a recent `submission_stale_heartbeat`/`code_similarity`
   row → still stale → flag inserted (red against today's code);
4. non-submit context (default options) + stale → validation passes, NO insert
   (red against today's code);
5. flag-insert rejection → submission still validates (fail-open pin).

## TE4-2 — Snapshot route tests don't pin "autosave never flags" (Medium)
`tests/unit/api/code-snapshots.route.test.ts` exists; extend it with a mock
assertion that the validator is called WITHOUT the flag opt-in (or that no
antiCheatEvents insert occurs) once AGG4-1's API shape exists.

## TE4-3 — Component-test gap: concurrent flush vs reportEvent (Medium)
`tests/component/anti-cheat-monitor.test.tsx` covers tri-state retention
(cycle-3) but not interleaving. With the claim-loop fix, add: deferred-fetch
flush in flight + blur dispatched → after resolution, blur was either sent or
still queued (never silently gone), and no event POSTed twice.

## TE4-4 — Source-pin test will need a deliberate update (note, not a gap)
`tests/unit/api/anti-cheat-public-event-types.test.ts:13` pins
`export const CLIENT_EVENT_TYPES = [` to the ROUTE file's source text. The
A4-2 extraction moves the canonical list to `src/lib/anti-cheat/`; update the
pin to the new module path in the same commit and keep an import-equality
assertion (route schema must consume the lib list) so the pin still guards
against drift rather than just file location.

## Flake scan
Full unit run at this HEAD: 0 failures, no retries logged. The two E2E specs
parameterized in cycle-3 (`E2E_HOME_HEADING`) removed the only known
deploy-smoke false positive; remaining known-flaky: auraedu tablet-rankings
cold-start (cycle-3 deploy record; environmental, watch on this cycle's
deploy). Login-gated E2E remain blocked on DEFER-ENV-GATES (carried).

## Sweep
No `.only`/`.skip` left in suites (grep clean). Hoisted-mock patterns in the
new cycle-3 tests are consistent with the harness conventions; no
order-dependence found (each file `vi.clearAllMocks()` in beforeEach).
