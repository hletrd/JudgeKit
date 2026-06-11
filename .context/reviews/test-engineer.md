# Test Engineer — RPF Cycle 3 (2026-06-11)

**HEAD reviewed:** 63429d97. Baseline executed: unit 333 files / 2579 tests PASS; component suite green per cycle-2 record; eslint/tsc/lint:bash clean.

## TE3-1 — No test covers the extension × anti-cheat boundary (MEDIUM, High — the gap that let CR3-1 ship)
Cycle-1's extension tests cover the PATCH route and `extendExamSession`; cycle-2's `ExamDeadlineSync` tests cover the client. Nothing exercises "extended participant emits anti-cheat events after `assignment.deadline`". Required red-first tests when fixing CR3-1 (`tests/unit/api/anti-cheat-*.test.ts` family):
1. windowed exam past `assignment.deadline`, session `personal_deadline` in the future → POST heartbeat/tab_switch returns 200 and inserts the row;
2. same setup, `personal_deadline` ALSO past → 403 `contestEnded` (the gate still works);
3. non-windowed (`scheduled`) exam past deadline → 403 unchanged (no behavior change outside windowed);
4. submissions-side: extended window submission does NOT write `submission_stale_heartbeat` when events are fresh (guards the false-flag regression).

## TE3-2 — Remote smoke asserts a config-dependent string (LOW-MEDIUM, High, CONFIRMED failing in production smoke)
`tests/e2e/public-shell.spec.ts:13`, `tests/e2e/responsive-layout.spec.ts:81` — see V3-3. Test-design fix: read `process.env.E2E_HOME_HEADING` into a RegExp with the current pattern as default; document the knob in the spec header comment. Keep the assertion (a visible h1 matters); make the expectation deployment-aware. `.env.deploy.auraedu`-driven smoke invocations should set it.

## TE3-3 — `exam-session` GET route tests don't pin the no-param fast path (LOW, Medium)
When CR3-4/PERF3-1 lands (lazy `canViewOthers`), add: (a) student poll without `userId` never calls `canViewAssignmentSubmissions` (mock assertion); (b) staff with `userId` param still resolves and returns the target's session; (c) non-staff with `userId` param still silently gets self (regression pin for the existing fallback semantic).

## TE3-4 — Doc-as-spec drift had no tripwire (INFO)
V3-1's stale `exam-integrity-model.md` claim survived multiple cycles because docs aren't gated. Cheap tripwire available in this repo's existing style (cf. `tests/unit/infra/retention-coverage.test.ts`): a unit test asserting `grep -c "antiCheatHeartbeatRequired" src` == the union-member count expected (i.e., 0 after cleanup) is overkill; the proportionate action is just the doc fix + dead-member removal. Recording the option; not recommending a doc-lint harness this cycle.

## Suite health (verified)
- Cycle-2's new tests are meaningful: retention class-closer has walker-sanity + exact allowlist (vacuous-pass-proof); rate-limit lost-race tests simulate ON CONFLICT semantics statefully in the login-path mock; ExamDeadlineSync tests cover interval, refocus, later-only, offline, and storm-guard.
- No flaky patterns introduced: new component tests use fake timers; no real-network awaits; the 60 s interval is constant-driven (importable) rather than magic-number-duplicated.
- E2E for the deadline-sync feature remains deferred under DEFER-ENV-GATES (no provisioned test server from this env) — carried with unchanged exit criterion; unit/component layers exist.
- Coverage gaps carried from the register (T4 etc.) unchanged; nothing in cycles 1–2 reduced existing coverage (no test deletions except the dead-spy refactor a0570eda, which removed assertion-free code).
