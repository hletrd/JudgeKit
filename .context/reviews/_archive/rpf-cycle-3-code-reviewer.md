# RPF Cycle 3 — Code Reviewer

**Date:** 2026-04-29
**HEAD reviewed:** 66146861 (fix(deploy): 🐛 use /tmp directly for SSH ControlPath socket dir)
**Scope:** Full repository, 567 TS/TSX files + 1001-line `deploy-docker.sh` + scripts/, judge-worker-rs, rate-limiter-rs, code-similarity-rs.

## Cycle change surface

Since cycle-2 plan was authored at HEAD `c449405d`:

- `21125372` — `deploy-docker.sh`: SSH ControlMaster + ControlPersist=60 + ServerAliveInterval=30 multiplexing; `_initial_ssh_check` retry loop (4 attempts, exponential backoff 2-16s); `EXIT` trap to issue `ssh -O exit` and rm the socket dir.
- `66146861` — `deploy-docker.sh`: hardcode `mktemp -d /tmp/judgekit-ssh.XXXXXX` instead of `$TMPDIR`-derived path. Reason quoted in commit body: macOS `$TMPDIR` is `/var/folders/.../T/`; combined with the 40-char `%C` hash this exceeds the 104-byte Unix-domain socket-path limit and breaks every SSH attempt with "ControlPath too long".

No `src/` files were modified. No production application logic was changed. The change surface is bash-only (deploy script) and is the implementation of cycle-2 plan Task B (sshpass auth flakiness).

## Review of `deploy-docker.sh` change

### Correctness
- `mktemp -d /tmp/judgekit-ssh.XXXXXX` followed by `chmod 700 "$SSH_CONTROL_DIR"` (lines 151-152) creates a 0700 directory. Belt-and-suspenders: `mktemp -d` itself returns a 0700 directory on every Linux/macOS in scope, so the explicit `chmod 700` is redundant but harmless.
- The `ControlPath` template is `${SSH_CONTROL_DIR}/cm-%C` (line 153). With `%C = SHA1(host:port:user)` (40 hex chars), the resulting path is `/tmp/judgekit-ssh.XXXXXX/cm-<40>` ≈ 22 + 40 + 4 = 66 bytes — comfortably under the 104-byte Unix socket path limit. Confirmed.
- `_cleanup_ssh_master` (lines 155-162) calls `ssh -O exit` to gracefully terminate the master, then `rm -rf` the socket dir. The trap is `trap _cleanup_ssh_master EXIT` (line 163) so it runs on normal exit, error exit, and SIGINT (because `set -e` exits via the trap). Looks correct.
- `_initial_ssh_check` (lines 165-178) retries up to 4 times with `delay = 2, 4, 8` seconds. After the loop, total wall time ≤ 14s + 4 × ConnectTimeout=15s = up to 74s before declaring failure. Acceptable for production deploy.

### Issues found

**C3-CR-1 [LOW] `chmod 700` after `mktemp -d` is redundant; OK but tracker comment would help future readers.**
- File/lines: `deploy-docker.sh:151-152`.
- Severity: LOW (not a defect; potential confusion for future maintainers).
- Confidence: HIGH.
- Rationale: `mktemp -d` already returns a 0700 directory on POSIX systems. The `chmod 700` line cannot tighten permissions further; it can only narrow them in a future hypothetical where `umask 0077` is unset. A single-line comment "# defense-in-depth, mktemp -d already creates 0700" would prevent future "is this a security fix or a no-op?" questions.
- Failure scenario: None. Pure documentation hygiene.
- Suggested fix: Add a one-line comment OR drop the redundant `chmod 700`.

**C3-CR-2 [LOW] `remote_sudo` still pipes `$SSH_PASSWORD` twice and assumes SSH password = sudo password.**
- File/lines: `deploy-docker.sh:204-214`.
- Severity: LOW (operational, not a runtime app vuln).
- Confidence: HIGH.
- Rationale: `printf '%s\n' "$SSH_PASSWORD" | sshpass -p "$SSH_PASSWORD" ssh $SSH_OPTS "${REMOTE_USER}@${REMOTE_HOST}" "sudo -S -p '' bash -lc ${quoted_cmd}"` couples three things:
  1. `sshpass` consumes `$SSH_PASSWORD` for SSH auth (now mostly bypassed because the master is multiplexed).
  2. `sudo -S` reads the password from stdin — fed by `printf '%s\n' "$SSH_PASSWORD"`.
  3. The SSH password and sudo password are assumed identical. If they ever differ (rotation, audit-driven separation), every `remote_sudo` call silently fails.
- Cycle-2 finding (C2-AGG-2) recommended: introduce `SSH_SUDO_PASSWORD` env var, fall back to `SSH_PASSWORD` only when unset. Not implemented in cycle-2 commits 21125372 + 66146861. The deploy now succeeds at the nginx step (cycle-3 deploy log shows 0 "Permission denied" lines), so the immediate operational pain is resolved, but the latent assumption is unchanged.
- Failure scenario: Future operator rotates the sudo password without rotating the SSH password (or vice-versa). Every `remote_sudo` call fails. Deploy aborts at the nginx step with a misleading "Permission denied" that points at SSH rather than sudo.
- Suggested fix: Two lines —
  ```bash
  : "${SSH_SUDO_PASSWORD:=${SSH_PASSWORD:-}}"
  # ...
  printf '%s\n' "$SSH_SUDO_PASSWORD" | sshpass -p "$SSH_PASSWORD" ssh ...
  ```

**C3-CR-3 [LOW] `_initial_ssh_check` exits on first success but doesn't log "succeeded after N attempts" — operator visibility gap.**
- File/lines: `deploy-docker.sh:165-178`.
- Severity: LOW.
- Confidence: HIGH.
- Rationale: When attempt 1 fails and attempt 2 succeeds, the log shows "Initial SSH connectivity attempt 1/4 failed; retrying in 2s..." then proceeds to "SSH connection to ${REMOTE_HOST} verified". The operator cannot tell whether the retry was needed or whether the server is healthy. Adding `info "SSH connection succeeded after ${attempt} attempts"` when `attempt > 1` would make the retry observable in operations logs / post-mortems.
- Failure scenario: Long-term — operators don't see the SSH host slowly degrading until it crosses the 4-attempt threshold and the deploy hard-fails.
- Suggested fix: One line inside the success branch.

### No issues found in
- `_cleanup_ssh_master` cleanup logic — correctly idempotent, no double-rm hazard.
- The `EXIT` trap stacking (`trap _cleanup_ssh_master EXIT`) — consistent with existing trap usage elsewhere in the script.
- Deploy attempts after the cycle-2 fix completed without any "Permission denied" lines (verified by orchestrator history: "the cycle-3 deploy log shows 0 Permission-denied lines").

## Carry-forward findings (status verified at HEAD 66146861)

- **C2-AGG-1** (chmod 0600 .env.production): RESOLVED at HEAD by cycle-2 commit `ab31a40f`. Verified in `deploy-docker.sh:277` (`chmod 0600 "${SCRIPT_DIR}/.env.production"`) AND `deploy-docker.sh:283` (defense-in-depth on existing-file path).
- **C2-AGG-2** (sshpass fragility): PARTIALLY RESOLVED. ControlMaster + retry deployed; the assumed-equal SSH/sudo password coupling (this cycle's C3-CR-2) still pending.
- **C2-AGG-3** (drizzle policy doc): RESOLVED. `AGENTS.md:349-362` already documents the `DRIZZLE_PUSH_FORCE` policy with the "When NOT to use" guard. The cycle-2 plan thought this was deferred, but inspection shows it's already in the docs (predating cycle 1 — see `AGENTS.md` "Database migration recovery" section).
- **C2-AGG-4** (deploy SKIP_* regression test): UNCHANGED. Deferred per cycle-2 exit criterion ("a `tests/deploy/skip-languages-honor.sh` smoke test or a `bash -n deploy-docker.sh` lint job is added"). No tests/deploy/ directory exists yet. Roll forward.
- **C2-AGG-5** (visibility-aware polling duplication): UNCHANGED. 14 `visibilitychange` listeners in `src/`, 4-6 components implementing the visibility-aware polling pattern. Carry-forward.
- **C2-AGG-6** (Path B perf): UNCHANGED. `src/app/(public)/practice/page.tsx:417` block intact.
- **C2-AGG-7** (window.location.origin invitation URL): UNCHANGED. 7 occurrences, including invitation flow (`recruiting-invitations-panel.tsx:99`, `access-code-manager.tsx:137`). Carry-forward.

## Summary

- 3 new LOW-severity findings (C3-CR-1, C3-CR-2, C3-CR-3) all in `deploy-docker.sh`.
- C3-CR-2 is the cycle-2 deferred sub-finding of the same C2-AGG-2 root cause; cycle-2 commits resolved the deploy-blocker but left the SSH/sudo coupling.
- All carry-forward findings either RESOLVED at HEAD or status UNCHANGED; none NEW outside `deploy-docker.sh`.
- No HIGH/MEDIUM findings on the change surface.

**Total new findings this cycle:** 3 LOW.
