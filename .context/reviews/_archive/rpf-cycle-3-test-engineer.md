# RPF Cycle 3 — Test Engineer

**Date:** 2026-04-29
**HEAD reviewed:** 66146861
**Scope:** Test coverage, flaky tests, TDD opportunities for the cycle-3 change surface.

## Cycle change surface

`deploy-docker.sh` only.

## Test-coverage assessment

The cycle-2 changes (SSH ControlMaster + retry loop + EXIT trap) have NO automated tests. Bash-level unit testing for SSH multiplexing requires mocking `ssh`, `sshpass`, `mktemp` — non-trivial. Two reasonable test strategies:

### Strategy A: bats-core unit tests

Lightweight bash test framework. Test scenarios:

1. `_initial_ssh_check` returns 0 on first success → no retries logged.
2. `_initial_ssh_check` returns 0 after 2 attempts → "attempt 1/4 failed" appears in stderr.
3. `_initial_ssh_check` returns 1 after 4 attempts → exits with code 1, all 4 attempts logged.
4. `_cleanup_ssh_master` runs idempotently when called twice.
5. `mktemp -d /tmp/judgekit-ssh.XXXXXX` creates a 0700 directory.

Estimated effort: 2-3 hours. Adds `tests/deploy/ssh-helpers.bats`. Existing scripts in `scripts/` would benefit too.

### Strategy B: shellcheck + bash -n

Pure static analysis. Catches:
- Syntax errors (`bash -n`).
- Quoting issues, unset variable usage, command substitution gotchas (`shellcheck`).

Estimated effort: 30 minutes. CI-only; runs on every PR.

### Recommendation

Strategy B (shellcheck + bash -n) FIRST as a CI gate. It's cheap, catches the broadest set of bugs, and provides the regression guard that C2-AGG-4 (deploy regression test) is asking for. Strategy A as a follow-on for the SSH-helpers specifically.

**C3-TE-1 [LOW] No CI gate for `bash -n` / `shellcheck` on `deploy-docker.sh`.**
- File: `eslint.config.mjs` / package.json (no `lint:bash` script exists).
- Severity: LOW.
- Confidence: HIGH.
- Failure scenario: Future cycle introduces a syntax error in `deploy-docker.sh` (e.g., unmatched heredoc terminator). Caught only at deploy time on the live target. Wastes deploy attempts.
- Suggested fix: Add `lint:bash` script — `bash -n deploy-docker.sh deploy.sh scripts/*.sh && shellcheck deploy-docker.sh deploy.sh scripts/*.sh`. Wire into CI.
- Status: LOW, deferrable. Exit criterion: another syntax error makes it through to a deploy attempt, OR PROMPT 2 of any future cycle picks up the deploy-hardening backlog.

**C3-TE-2 [LOW] `tests/deploy/` directory does not exist; cycle-2 plan's exit criterion for C2-AGG-4 explicitly named `tests/deploy/skip-languages-honor.sh`.**
- File: N/A (would create `tests/deploy/skip-languages-honor.sh`).
- Severity: LOW.
- Confidence: HIGH.
- Cross-reference: C2-AGG-4.
- Suggested fix: A 30-line bats-core test that:
  1. Sets `SKIP_LANGUAGES=true` and a fake `REMOTE_HOST` / `SSH_KEY` to a non-resolving address.
  2. Source the deploy-docker.sh up to (but not including) the rsync step.
  3. Assert that `SKIP_LANGUAGES == "true"` after parsing.
- Status: LOW, deferrable. Same exit criterion as C2-AGG-4.

## Existing test gates (status confirmed)

- `npm run lint`: clean (cycle-1 baseline).
- `npx tsc --noEmit`: clean (cycle-1 baseline).
- `npm run test:unit`, `test:integration`, `test:component`, `test:security`, `test:e2e`: pre-existing env failures (DATABASE_URL not set, no rate-limiter sidecar, Playwright webServer cannot start). Cycle-1 Task H established this is environmental; cycle-2 Task Z confirmed no regressions caused by cycle-2 changes. Cycle 3's change surface is bash-only — same conclusion applies.

## Carry-forward test-engineer findings

- **C2-AGG-4** (deploy SKIP_* regression test): UNCHANGED. Mapped to C3-TE-1 + C3-TE-2 above.
- **DEFER-ENV-GATES** (env-blocked tests): UNCHANGED. Pre-existing infrastructure unavailability.

## Summary

- 2 new LOW findings (C3-TE-1, C3-TE-2) — both about deploy-script test coverage.
- Both can be addressed in one combined deploy-hardening cycle (with C2-AGG-4 as the umbrella ticket).

**Total new findings this cycle:** 2 LOW.
