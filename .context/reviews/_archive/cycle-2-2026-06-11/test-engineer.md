# Test Engineer — RPF Cycle 2 (2026-06-11)

**HEAD reviewed:** 4cf01035 (main)
**Suite state:** 332 unit files / 2571 tests PASS; DB-backed integration
suite (env-gated) 5 files / 45+ tests passed against real Postgres 17 in
cycle 1; Playwright smoke profile used post-deploy.

## Coverage gaps to close with this cycle's fixes (TDD targets)

### T2-1 — code-snapshots route has no language-gate or size tests (MEDIUM)
When implementing the `isJudgeLanguage` gate (CR2-1/SEC2-1), add red→green
tests mirroring the cycle-1 draft-route tests: 400 on junk language, happy
path on a real language, and the existing access/validation paths still pin.

### T2-2 — Retention coverage class-closer (MEDIUM, high leverage)
Critic #1: add a structural unit test asserting every prunable
sensitive-data table is either in `DATA_RETENTION_DAYS` + the
`pruneSensitiveOperationalData` allSettled set, or on an explicit documented
allowlist. Start the allowlist with genuinely-permanent tables (users,
problems, groups, settings...). This converts "we forgot snapshots" from a
review finding into a failing test.

### T2-3 — Rate-limit conflict-race test (LOW-MEDIUM)
The fix (onConflictDoNothing + re-read) needs a structural test pinning the
SQL shape (mock-level: insert is called with onConflictDoNothing) and, if
cheap, an env-gated integration case firing two concurrent first-hits on one
key and asserting neither throws.

### T2-4 — Student-deadline refresh (V2-1) hook test (LOW)
If the live-refresh lands as a hook/component change, pin: (a) refetch on
interval/visibility, (b) countdown target updates when the server returns a
later deadline, (c) no refetch storm (interval ≥ 30 s).

## Carried test debt (unchanged preconditions)
- T4: `scripts/verify-db-backup.sh` restore-test not CI-exercised
  (DEFER-ENV-GATES — no provisioned CI Postgres; mocking would fake the
  guarantee).
- TH1: pino error noise from intentional error-path tests in
  `contests.route.test.ts` (cosmetic; batch with next test-infra pass).
- DES-ENV: live agent-browser UI pass needs a provisioned staging host.

## Suite health notes
- No flaky tests observed across this cycle's three full unit runs.
- The cycle-1 source-grep inventory baseline (136→138) remains accurate at
  HEAD; any new `sql\`` usage this cycle must update it deliberately.
- tsconfig/vitest configs unchanged; component/integration configs intact.
