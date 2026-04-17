# Implementation plan — test, docs, and contract alignment (2026-04-17)

## Source review lines
Primary sources:
- `.context/reviews/comprehensive-code-review-2026-04-17-current-head.md`
  - broad-suite verification note + recommended next pass
- `.context/reviews/comprehensive-security-review-2026-04-17-current-head.md`
  - remaining security-adjacent risks not remediated in this pass

## Goal
Restore trust in the full repository quality gates by reconciling stale tests, source-grep contracts, and docs/assertions that no longer match the current implementation.

## Progress
- 🚧 in progress
- completed in the current pass:
  - root review backlog ownership was consolidated into a single roadmap/index set
  - targeted typecheck + eslint regressions blocking the latest remediation slice were cleared
  - built-in role/type constants were realigned with the shipped `assistant` role so contract tests can assert the real role roster
  - judge auth unit tests now mock the DB boundary explicitly and judge claim tests include the current per-worker auth helper
  - backup docs/tests now describe the shipped ZIP backup plus JSON-or-ZIP restore contract
  - stale source-grep assertions for the submission runtime path now point at the current component/file contracts
  - system settings and public contest helper tests now match the current helper return shapes
  - setup/deploy language inventory presets now stay aligned with the source-referenced `judge-pypy` image set
  - the public playground run route once again matches the guest-playground contract expected by its tests and public docs
  - metadata and playground contract suites were hardened against full-suite import timing/cache drift so they reflect the same contract under whole-suite execution
  - supporting helper cleanups (role bootstrap sync, deprecated DB/submission utility removals, and safer client state helpers) were verified against their contract tests
- still open:
  - full-suite contract drift across built-in role tests, judge auth mocks, backup docs tests, and brittle source-grep inventories

## Workstream A — Built-in role and capability contract drift
**Targets**
- `src/lib/capabilities/defaults.ts`
- `src/lib/capabilities/types.ts`
- `src/lib/security/constants.ts`
- `tests/unit/capabilities/defaults.test.ts`
- `tests/unit/security/constants.test.ts`

**Implementation intent**
- update tests/docs that still assume four built-in roles now that `assistant` exists;
- align role-level assertions, capability counts, and helper expectations with the current capability model;
- explicitly document which built-in-role invariants are normative.

**Acceptance criteria**
- capability/security role tests pass without weakening real authorization guarantees;
- repo docs and helper comments no longer disagree about the built-in role roster.

## Workstream B — Judge auth and claim-route test harness repair
**Targets**
- `src/lib/judge/auth.ts`
- `src/app/api/v1/judge/claim/route.ts`
- `tests/unit/judge/auth.test.ts`
- `tests/unit/api/judge-poll.route.test.ts`

**Implementation intent**
- make the judge auth unit suite independent of ambient `DATABASE_URL` requirements;
- update route mocks to include `isJudgeAuthorizedForWorker` and the current claim-path audit behavior;
- ensure tests cover both per-worker token success and invalid-worker-token rejection.

**Acceptance criteria**
- `tests/unit/judge/auth.test.ts` and `tests/unit/api/judge-poll.route.test.ts` pass against the current judge auth model;
- the tests fail for real auth regressions, not mock drift.

## Workstream C — Backup/export UI/doc contract alignment
**Targets**
- `src/app/(dashboard)/dashboard/admin/settings/database-backup-restore.tsx`
- `src/app/api/v1/admin/backup/route.ts`
- `docs/api.md`
- `tests/unit/admin/backup-docs-consistency.test.ts`

**Implementation intent**
- reconcile the current ZIP-capable backup UI with tests/docs that still expect JSON-only backup behavior;
- keep the dedicated backup route, migrate/export route, and docs explicit about sanitized vs full-fidelity outputs.

**Acceptance criteria**
- backup docs tests assert the real product contract;
- UI copy, accepted file types, and route docs describe the same artifact formats.

## Workstream D — Source-grep inventory and brittle implementation-test cleanup
**Targets**
- `tests/unit/infra/source-grep-inventory.test.ts`
- `tests/unit/ui-runtime-implementation.test.ts`
- `tests/unit/submission-queue-status-implementation.test.ts`
- `tests/unit/judge-progress-implementation.test.ts`
- `tests/unit/ui-i18n-keys-implementation.test.ts`
- `tests/unit/infra/language-inventory.test.ts`

**Implementation intent**
- update or retire brittle source-grep tests that assert stale file paths, fixed string snippets, or obsolete baselines;
- convert high-value checks to behavioral tests where practical;
- keep a smaller, justified inventory of source-grep tests for contracts that truly cannot be exercised cheaply.

**Acceptance criteria**
- source-grep inventory baseline matches the intentionally retained set;
- stale file-path/string assertions are either refreshed or replaced with behavior-based coverage.

## Workstream E — Config/test drift in system settings and public contest helpers
**Targets**
- `src/lib/system-settings.ts`
- `tests/unit/system-settings.test.ts`
- `src/lib/assignments/public-contests.ts`
- `tests/unit/assignments/public-contests.test.ts`

**Implementation intent**
- align tests with current return shapes and fallback behavior;
- make helper outputs explicit so later UI changes do not silently break contract tests.

**Acceptance criteria**
- system-settings and public-contest helper tests pass without hiding meaningful behavior changes.

## Verification expectations
- `npx vitest run` passes for the touched suites;
- where source-grep tests remain, each retained test documents why it is intentionally text-contract-based rather than behavioral.

## Completion bar
This plan is ready to archive only when the full repo-local quality gate becomes trustworthy again: current behavior, tests, and docs all describe the same contracts.
