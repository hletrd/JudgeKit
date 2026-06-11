# RPF Cycle 3 — Debugger (latent bugs, failure modes, regressions)

**Date:** 2026-04-29
**HEAD reviewed:** 66146861

## Failure-mode analysis of cycle-2 commits

### Mode 1: `mktemp -d /tmp/judgekit-ssh.XXXXXX` fails (e.g., `/tmp` full or read-only)

- `set -euo pipefail` (line 22) is active. `mktemp -d` returns non-zero. `SSH_CONTROL_DIR` assignment fails. Script exits.
- Trap is not yet installed (line 163 follows line 151), so no cleanup. Acceptable — there's nothing to clean up.
- **Result:** Clean failure. Operator sees "mktemp: cannot make directory ..." and aborts.
- **No finding.**

### Mode 2: Trap fires before `_initial_ssh_check` succeeds

- If the script exits between line 163 (trap installed) and line 232 (`_initial_ssh_check`), the trap calls `ssh -O exit` against an unestablished master. The `2>/dev/null || true` swallows the error. `rm -rf "$SSH_CONTROL_DIR"` removes the empty dir.
- **Result:** Clean. No finding.

### Mode 3: `_initial_ssh_check` succeeds on attempt 1; trap fires at script exit

- Master is established. Trap calls `ssh -O exit` to gracefully terminate. Master cleanly closes. `rm -rf` removes the socket dir.
- **Result:** Clean. No finding.

### Mode 4: `_initial_ssh_check` fails 4 times; `die` is called

- Script calls `die "Cannot SSH to ..."`. `die` prints error, calls `exit 1`. Trap fires.
- The trap calls `ssh -O exit` against a master that doesn't exist (no successful auth occurred). `2>/dev/null || true` swallows. `rm -rf` removes the empty dir.
- **Result:** Clean. No finding.

### Mode 5: SIGINT (Ctrl-C) mid-deploy

- `set -e` does not by itself trap SIGINT, but bash propagates SIGINT to subshells. The `EXIT` trap fires on SIGINT-induced exit. Master is closed cleanly via `ssh -O exit`. Socket dir is removed.
- **Result:** Clean. No finding.

### Mode 6: Master gets killed externally (e.g., another `ssh -O exit` from a coresident session)

- `_cleanup_ssh_master` calls `ssh -O exit` against an already-dead master. Returns non-zero. `2>/dev/null || true` swallows. `rm -rf` removes whatever's left.
- **Result:** Clean. No finding.

### Mode 7: ControlPath socket survives across runs (mktemp suffix collision)

- `mktemp -d` template `/tmp/judgekit-ssh.XXXXXX` uses 6 alphanumeric chars (62^6 ≈ 5.7×10^10 namespace). Collision probability per run pair ≈ 1/5.7e10. Negligible.
- Even if a collision happened, `mktemp -d` errors out atomically (POSIX guarantees the create-and-test is atomic).
- **Result:** No collision risk. No finding.

### Mode 8: ControlMaster socket race when two deploys run in parallel against the same target

- Each deploy gets its own `SSH_CONTROL_DIR` (different mktemp suffix) and its own `ControlPath` (same `%C` hash but different parent dir). Two masters coexist. No interference.
- **Result:** Clean. No finding.

### Mode 9: SSH session expires mid-deploy (ServerAliveInterval=30 misses 3 keepalives)

- `ServerAliveInterval=30 ServerAliveCountMax=3` → connection drops after 90s of unresponsiveness. Subsequent `remote` calls would hit the dead master, fail, and the script exits via `set -e`.
- **Latent risk:** If the remote host hibernates / gets paused (e.g., laptop closed during deploy from home), the deploy hard-fails 90s later. There's no automatic master re-establishment.
- Severity: LOW — operators usually don't hibernate mid-deploy.
- **C3-DB-1 [LOW] No automatic ControlMaster re-establishment after SSH session expiry.**
  - File/lines: `deploy-docker.sh:140-178`.
  - Severity: LOW.
  - Confidence: MEDIUM.
  - Failure scenario: Long-running deploy step (e.g., `docker build` takes 5+ minutes) on a flaky network. Master times out on keepalive. Next `remote` call exits non-zero. Script aborts.
  - Suggested fix: Wrap each `remote*` call with a single re-attempt that re-runs `_initial_ssh_check` if the previous call returned a "ControlSocket: connection refused" error. ~10 lines.
  - Status: LOW, deferrable. Exit criterion: a deploy fails with "ControlSocket connection refused" log, OR a long-deploy step >5 min runs against a flaky network in CI.

## Latent-bug sweep on existing deploy-docker.sh sections (no new findings)

- The `_initial_ssh_check` `(( delay = delay * 2 ))` arithmetic uses `delay=2,4,8` for attempts 1-3, then attempt 4 reuses delay=8. Total = 2+4+8 = 14s. Verified arithmetic.
- The trap is `EXIT` only — does not include `ERR`. This is correct: `set -e` exits via the implicit EXIT trap path.

## Carry-forward latent bugs (status unchanged)

- **D1 (JWT clock-skew):** carry-forward, MEDIUM, deferred.
- **D2 (JWT DB query per request):** carry-forward, MEDIUM, deferred.
- **AGG-2 (`Date.now()` rate-limit):** carry-forward, MEDIUM, deferred.

## Summary

- 1 new LOW finding (C3-DB-1) on `deploy-docker.sh`. No latent bugs introduced by cycle-2 commits.
- All carry-forward latent bugs unchanged.

**Total new findings this cycle:** 1 LOW.
