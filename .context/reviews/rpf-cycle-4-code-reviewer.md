# RPF Cycle 4 — code-reviewer perspective (orchestrator-driven, 2026-04-29)

**Date:** 2026-04-29
**HEAD reviewed:** `e61f8a91` (per orchestrator history; no `src/` changes since cycle 3 working HEAD `66146861`)
**Scope:** Whole repository, with focus on the same change surface cycle-3 reviewed (`deploy-docker.sh`) plus a sweep for issues cycle-3 may have missed.
**Note:** Earlier `rpf-cycle-4-*.md` files on disk were from a prior unrelated RPF run dated 2026-04-23 at commit `d4b7a731`. Those have been superseded by this cycle's reviews at HEAD `e61f8a91`.

## Findings

### C4-CR-1: [LOW, High confidence] `remote_sudo` printf piping leaks SSH password into a process pipeline (carry-forward)

**File/lines:** `deploy-docker.sh:204-214`

The current shape:
```bash
printf '%s\n' "$SSH_PASSWORD" | sshpass -p "$SSH_PASSWORD" ssh $SSH_OPTS ...
```

Two issues compounded:
1. `sshpass -p "$SSH_PASSWORD"` exposes the password in `argv` (`ps -ef` on the deploy host shows `sshpass -p XXXXX`).
2. The leading `printf '%s\n' "$SSH_PASSWORD" |` adds a child process that holds the password in its own argv (briefly), and pipes it on stdin to ssh — so `sudo -S` reads the SSH password to authenticate the sudo step. This is the SSH/sudo coupling C3-AGG-2 already named.

**Verification:** This finding is the same code path as C3-AGG-2 (LOW, deferred). No new severity. Logging here as confirmation.

**Status:** Carry-forward of C3-AGG-2; no new action.

### C4-CR-2: [LOW, Medium confidence] `_initial_ssh_check` ignores `remote()` exit code on transient sshpass non-auth errors (carry-forward)

**File/lines:** `deploy-docker.sh:165-178`

```bash
if remote "echo ok" >/dev/null 2>&1; then return 0; fi
```

`remote` returns sshpass's exit code, which conflates auth failure (5), connection refused (255), and many others under "non-zero". The retry loop treats them all the same. Cycle-3's C3-AGG-3 already named this; same root cause.

**Status:** Carry-forward of C3-AGG-3 + C3-AGG-10 (no "succeeded after N attempts" log). No new action.

### C4-CR-3: [INFO, High confidence] No code-reviewer findings beyond cycle-3 carry-forwards

I re-walked `deploy-docker.sh` lines 1–250 and `deploy.sh` lines 1–289. No additional code-quality issues that cycle-3 missed. The two scripts remain the only files in the change surface.

## Sweep for commonly missed issues

- Logic bugs: none new.
- Edge cases: covered by cycle-3.
- Race conditions: cycle-3's tracer covered SSH connection ordering. Nothing new.
- Error handling: cycle-3 covered `_initial_ssh_check` retry semantics.
- Invariant violations: none new.
- Data-flow: none new.
- Documentation-code mismatch: cycle-3 already filed C3-AGG-7 for the header docstring.

## Confidence

High that the cycle-3 findings are still applicable at HEAD `e61f8a91`. High that there are no new HIGH/MEDIUM code-review findings.
