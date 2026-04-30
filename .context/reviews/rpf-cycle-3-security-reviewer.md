# RPF Cycle 3 — Security Reviewer

**Date:** 2026-04-29
**HEAD reviewed:** 66146861
**Scope:** Full repo, focus on auth, secrets, deploy, OWASP top 10, sandboxing.

## Cycle change surface

`deploy-docker.sh` only — SSH ControlMaster multiplexing (cycle-2 commits `21125372` + `66146861`).

## Findings on the change surface

**C3-SR-1 [LOW] SSH ControlMaster socket directory in shared `/tmp` is unique by mktemp suffix but path-predictable.**
- File/lines: `deploy-docker.sh:151`.
- Severity: LOW.
- Confidence: HIGH.
- Rationale: The socket dir lives at `/tmp/judgekit-ssh.XXXXXX` (mktemp 6-char alphanumeric suffix). The directory is 0700 (line 152) so a peer user on the deploy host cannot list its contents, but the directory NAME is enumerable via `ls /tmp` and the file mode metadata (size, mtime) is readable. Combined with `ControlPath=cm-%C` (40-char SHA1 of host:port:user — predictable for a known target), an attacker on the same host who is *aware* the deploy is running can construct the socket pathname. They cannot connect because the socket is 0700-owned by the deploy operator. Defense-in-depth only.
- Repo policy quote: CLAUDE.md "Destructive Action Safety": *"Secrets & Credentials: ... writing secrets to unencrypted files or logs"*. The ControlMaster socket is not a credential file; this rule does not directly apply, but the spirit (don't write secrets to predictable paths) extends here in the form of "don't reveal that a privileged deploy is in flight to coresident users".
- Concrete failure scenario: Multi-tenant deploy host. Attacker user `mallory` runs `ls /tmp/judgekit-ssh.*` periodically; can detect when the operator is mid-deploy and time follow-on attacks (e.g. waiting for the deploy to finish before running their own privileged operation). Not a credential leak; it's a timing-side-channel for deploy activity.
- Suggested fix options:
  - Defense-in-depth (small): Use `mktemp -d /tmp/judgekit-ssh-$(id -un).XXXXXX` so the dirname includes the deploy operator. Still 0700 but at least makes "who is deploying" explicit.
  - Better: prefer `~/.ssh/control` if it exists and has 0700 perms; fall back to `/tmp` only when home is on a noexec/nosuid mount (unlikely on workstations). One extra `if [[ -d "$HOME/.ssh" ]]` block.
- Status: Per repo deferred-fix rules, LOW is deferrable with exit criterion. Proposed exit criterion: a multi-tenant deploy host is added to the routine deploy targets, OR an operator reports peer-user awareness of deploy timing.

**C3-SR-2 [LOW] `printf '%s\n' "$SSH_PASSWORD" | ...` exposes password to argv on `printf` for one syscall window.**
- File/lines: `deploy-docker.sh:210`.
- Severity: LOW.
- Confidence: MEDIUM.
- Rationale: `printf '%s\n' "$SSH_PASSWORD"` is a bash builtin in modern shells (verified: `type printf` on bash 5.x prints "printf is a shell builtin"). Therefore there's NO process-table window where the password appears in `ps -ef`. However, if a future operator runs the script under `sh` (POSIX sh + dash on Debian), `printf` may resolve to `/usr/bin/printf` which IS forked, and the password would briefly appear in argv. The shebang `#!/usr/bin/env bash` (line 1) prevents this in normal use, but `bash deploy-docker.sh` invocation respects the shebang while `sh deploy-docker.sh` doesn't.
- Concrete failure scenario: Operator runs `sh ./deploy-docker.sh` by muscle memory or through sudoless wrapper. `printf` forks; `ps -ef` peer process sees `printf '%s\n' Pa$$w0rd!`. Password leaked to coresident users.
- Repo policy quote: CLAUDE.md "Secrets & Credentials: Using plaintext secrets/tokens shared in conversation (MUST warn user to rotate first), writing secrets to unencrypted files or logs" — argv is functionally similar to a logfile from a coresident-user perspective.
- Suggested fix: Use bash here-string `<<<"$SSH_SUDO_PASSWORD"` which feeds via stdin without spawning a child:
  ```bash
  sshpass -p "$SSH_PASSWORD" ssh $SSH_OPTS "${REMOTE_USER}@${REMOTE_HOST}" "sudo -S -p '' bash -lc ${quoted_cmd}" <<<"$SSH_SUDO_PASSWORD"
  ```
- Status: LOW, deferrable with exit criterion: "Switch to here-string OR enforce bash-only invocation in CI lint job."

## Carry-forward findings (status at HEAD)

- **AUTH (D1, D2 carry):** JWT clock-skew + JWT DB query on every request — both still present in `src/lib/auth/`. MEDIUM, deferred to auth-perf cycle. No new evidence; status UNCHANGED.
- **C2-AGG-1** (chmod .env.production): RESOLVED at HEAD by `ab31a40f`. Verified.
- **C2-AGG-7** (window.location.origin in invitation URL): UNCHANGED. `src/components/contest/recruiting-invitations-panel.tsx:99` still uses `window.location.origin`. LOW, defense-in-depth, no current exposure on canonical algo.xylolabs.com (single-host nginx). Carry-forward.
- **PLUGIN_CONFIG_ENCRYPTION_KEY backfill** (`deploy-docker.sh:335`): generates and writes a fresh secret to remote `.env.production` if missing. Comment notes "the value is stable as long as it's not deleted, so an accidental re-run does NOT rotate it" — this is correct (idempotent); no security finding.

## Repo-wide sweep (no new findings on `src/`)

- `grep -RIn "innerHTML\|dangerouslySetInnerHTML" src/` — no results outside `react-katex` markdown rendering paths (which sanitize via the markdown pipeline).
- `grep -RIn "eval\(\|new Function\(" src/` — no results in app code.
- `grep -RIn "process\.env\." src/lib/auth/` — verified `AUTH_SECRET`, `AUTH_TRUST_HOST`, `AUTH_URL`, `JUDGE_AUTH_TOKEN`, all read at startup; no leak path to client bundle (client components use `NEXT_PUBLIC_*` only).
- `grep -RIn "Math\.random\(" src/lib/auth/ src/lib/judge/auth.ts src/lib/api-rate-limit.ts` — no results. Random sources are `crypto.randomBytes` / `nanoid`.
- File-upload validators (`src/lib/files/`, `src/lib/validators/`) — present, no SVG/script leakage path observed in this pass.

## Summary

- 2 new LOW security findings on `deploy-docker.sh` (C3-SR-1, C3-SR-2). Both are defense-in-depth.
- 0 new HIGH/MEDIUM findings.
- All carry-forward security findings at expected status; one (C2-AGG-1) confirmed RESOLVED.

**Total new findings this cycle:** 2 LOW.
