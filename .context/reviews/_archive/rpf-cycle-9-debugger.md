# RPF Cycle 9 — Debugger

**Date:** 2026-04-29
**HEAD reviewed:** `1bcdd485`.

## Cycle-8 diff bug-hunt

Re-examined the 18-file cycle-8 diff for logic errors, edge cases, race conditions, error-handling gaps, and invariant violations.

### `deploy-docker.sh` soft cap (lines 232-238)

```bash
if (( max_attempts > 100 )); then
    warn "DEPLOY_SSH_RETRY_MAX='${max_attempts}' exceeds soft cap of 100; clamping to 100"
    max_attempts=100
fi
```

Edge cases checked:
- `max_attempts=100`: `(( 100 > 100 ))` → false → cap not triggered. Correct (cap value 100 is allowed).
- `max_attempts=101`: `(( 101 > 100 ))` → true → clamped to 100. Correct.
- `max_attempts=4` (default): cap untouched. Correct.
- `max_attempts=0` (rejected upstream by validator): falls back to 4 before reaching cap. Correct.
- `max_attempts="abc"` (rejected upstream): falls back to 4. Correct.
- `max_attempts="-5"`: rejected by `^[0-9]+$` upstream → falls back to 4. Correct.
- `max_attempts="9999999999999999999999"` (overflow): bash arithmetic truncates to 64-bit; comparison still works since any large value > 100. Verified `(( 9999999999999999999999 > 100 ))` returns true (after silent truncation). The warn line still prints the original string from `${max_attempts}`. Correct, defensive.

No bugs found.

### `src/lib/security/{api-rate-limit,in-memory-rate-limit}.ts` JSDoc headers

Pure documentation insertion. No runtime impact possible.

### `README.md` Time Synchronization section

Documentation-only. The cited regression test `tests/unit/api/time-route-db-time.test.ts` exists at HEAD (verified by `find tests/unit/api -name "time-route*"` — present).

### Plan archival (`plans/done/2026-04-29-rpf-cycle-7-review-remediation.md`)

`git mv` rename — content identical pre/post, only path changed. No drift.

## Findings

**0 NEW.**

## Race conditions / invariants checked

- The soft cap does not introduce a new race: `_initial_ssh_check` runs serially before any worker dispatch.
- The cap mutates `max_attempts` *before* the retry loop reads it — no TOCTOU window.
- Rate-limit JSDoc headers do not introduce execution paths, so no concurrency surface change.

## Stale/dead-code sweep on the diff

- The cap clamp is reachable iff `DEPLOY_SSH_RETRY_MAX > 100`; that path is testable via `DEPLOY_SSH_RETRY_MAX=200 ./deploy-docker.sh` in a dry-run harness. Not currently covered by automated bash tests (none exist for deploy-docker.sh). Bash testing is DEFERRED at the project level (no harness).

## Confidence

High on "0 NEW debugger findings."

## Recommendation

No action required for cycle 9 from the debugger lane.
