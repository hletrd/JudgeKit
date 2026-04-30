# RPF Cycle 4 — security-reviewer perspective (orchestrator-driven, 2026-04-29)

**Date:** 2026-04-29
**HEAD reviewed:** `e61f8a91` (no `src/` changes since cycle 3 HEAD `66146861`)
**Threat model:** OWASP Top 10 + secret handling + auth/authz + supply chain.

## Findings

### C4-SR-1: [LOW, High confidence] `sshpass -p "$SSH_PASSWORD"` exposes secret in argv (carry-forward)

**File/lines:** `deploy-docker.sh:175,184,191,201,209,212`

Six call sites pass the password as `-p "$SSH_PASSWORD"`. On the deploy host (the operator's workstation), any local user can `ps -ef | grep sshpass` during the deploy and see the password.

**Mitigation precedent:** sshpass supports `-f <file>` and `-e` (read from `SSHPASS` env var, which is itself argv-invisible to other users on Linux).

**Concrete failure scenario:** Multi-user deploy workstation. Attacker user `alice` runs `while sleep 0.1; do ps -ef | grep -F sshpass; done` during a deploy by user `bob`. The password is visible for the duration of every SSH call (~50–200 ms each).

**Repo policy check:** "writing secrets to unencrypted files or logs" applies. CLAUDE.md does not explicitly exempt `argv`. However, the deploy host is a single-operator developer workstation in current practice; `/proc/<pid>/cmdline` is readable only by the same user on a stock Linux installation (`hidepid=2` not assumed). LOW severity.

**Fix:** Switch to `-e` mode. One-line change per call site. This addresses C3-SR-2 (printf argv leak) at the same time.

**Status:** Carry-forward of C3-SR-2 / C3-AGG-2. No new severity.

### C4-SR-2: [INFO, High confidence] `.env.production` chmod 0600 fix from cycle 2 still in place

I verified `deploy-docker.sh:277` and `deploy-docker.sh:283`. Both apply `chmod 0600`. No regression.

### C4-SR-3: [LOW, Medium confidence] `_cleanup_ssh_master` is well-bounded

**File/lines:** `deploy-docker.sh:155-162`

The cleanup trap suppresses stderr and ignores exit code, and `rm -rf "$SSH_CONTROL_DIR"` is bounded to a `mktemp -d /tmp/judgekit-ssh.XXXXXX` directory. No path-injection risk.

### C4-SR-4: [INFO, Medium confidence] No supply-chain / dependency churn this cycle

Cycle-3 added zero `package.json` / `package-lock.json` changes. No new dependencies to vet.

## Sweep for commonly missed security issues

- Authn/authz: no `src/` changes; no new findings.
- Crypto: no `src/` changes; argon2/bcryptjs unchanged.
- Input validation: no `src/` changes.
- Output encoding: no `src/` changes.
- SSRF/path traversal in deploy script: confirmed `mktemp -d` boundary is safe.
- Secrets: only the sshpass argv finding above (already deferred).
- Logging: deploy script does not log raw secrets; `.env.production` is chmod 0600.
- CSP/CORS: no `src/` changes.

## Confidence

High that no new HIGH/MEDIUM security findings are introduced this cycle. Cycle-3's LOW deferred items remain valid.
