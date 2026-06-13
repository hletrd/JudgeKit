# Test Engineer — RPF Cycle 6 (2026-06-12)

**HEAD reviewed:** 22e1510f. **Suite state:** unit 338 files / 2632 tests PASS; component suite present (242 tests at cycle-5 close); integration/chaos suites present; E2E gated on env (DEFER-ENV-GATES). No flaky tests observed across this cycle's three full runs.

## Coverage gaps mapped to cycle-6 findings (red-first targets)

### TE6-1 — Token expiry/revocation paths have ZERO tests (HIGH-priority gap, High confidence)
No test exercises: (a) expired token → submit denied; (b) un-enrolled+valid-token → submit allowed; (c) member removal deletes the group's tokens; (d) `getContestUserStatus`/`getEnrolledContestDetail` with expired token. Red-first order for AGG6-1: write (a)+(c) failing first, then implement the shared predicate + revocation; (b) pins the intended grant so the fix can't over-correct; (d) covers the read sides.

### TE6-2 — `reportEvent` unload-loss has no regression test (component)
Existing monitor tests cover the FLUSH path's slot (claim → unmount mid-send → re-sent once). Add the symmetric case: `reportEvent` fires, unmount before the fetch resolves, remount → event must still transmit exactly once. Red against the current direct-send (it loses the event), green after queue-first.

### TE6-3 — Filter chips have no keyboard-interaction tests
After AGG6-7 (button-rendered chips): component test tabbing to a chip and activating with Enter/Space toggles the filter; `aria-pressed` asserted for the active chip in both dashboard and timeline.

### TE6-4 — Offset pagination tie-stability untested
Unit test for the submissions GET offset mode asserting the ORDER BY includes the id tiebreak (route-shape test in `submissions.route.test.ts` style), preventing silent regression.

### TE6-5 — Suite updates owed by the dead-vocabulary removal (CR6-2)
`code-similarity.test.ts` and the dashboard component test must drop/replace `service_unavailable` expectations; the i18n catalog pin (`source-grep-inventory.test.ts`) baseline will change if message keys are removed — adjust WITH justification in the commit body (the pin exists to force exactly this conversation).

### TE6-6 — LRU failure-path test (D6-3)
Route unit test: first heartbeat insert rejects → key evicted → immediate retry inserts successfully (assert two insert attempts, one row recorded). Mock the db insert to fail once.

## Suite-health observations
- The cycle-5 additions (anti-cheat-get-behavioral, presentation, storage tests) are well-isolated and deterministic (fake timers, no real network). Good patterns to reuse for TE6-2.
- `submissions.route.test.ts` already models the tx/rate-limit/flag matrix — TE6-1(a) fits there with minimal new scaffolding.
- No `xfail`/skipped tests in the unit suite; 4 expected-warn log lines in recruiting tests are assertions on failure paths, not noise.

## Final sweep
Checked for tests asserting the FALSE comment/string surfaces (V6-7/V6-8): none do — removal is safe without test rewrites beyond TE6-5.
