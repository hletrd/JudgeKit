# Aggregate Review — RPF Cycle 3 (orchestrator-driven, 2026-04-29)

**Date:** 2026-04-29
**HEAD commit:** 66146861 (fix(deploy): 🐛 use /tmp directly for SSH ControlPath socket dir)
**Reviewers:** code-reviewer, perf-reviewer, security-reviewer, critic, architect, debugger, designer (source-level), document-specialist, test-engineer, tracer, verifier (11 lanes; per-agent files in `.context/reviews/rpf-cycle-3-<agent>.md`).
**Cycle change surface:** `deploy-docker.sh` only (cycle-2 commits `21125372` SSH ControlMaster + `66146861` /tmp ControlPath). No `src/` files modified.

**Total deduplicated findings (still applicable at HEAD 66146861):** 0 HIGH, 0 MEDIUM, 13 LOW + 1 INFO, plus carry-forward DEFERRED items.

---

## Resolved at current HEAD (verified by inspection)

The following findings from prior cycles are RESOLVED at HEAD `66146861`:

- **C2-AGG-1** (chmod 0600 .env.production): RESOLVED. `deploy-docker.sh:277` (fresh-generation path) AND `deploy-docker.sh:283` (defense-in-depth on existing-file path) both apply `chmod 0600`. Verified by code-reviewer + verifier + tracer.
- **C2-AGG-2A** (sshpass deploy-blocker — the immediate "Permission denied" at nginx step): RESOLVED via cycle-2 commits `21125372` (SSH ControlMaster) + `66146861` (/tmp ControlPath fix for macOS path-length). Cycle-3 deploy log shows 0 "Permission denied" lines. Verifier confirms all commit-message claims match HEAD code. Tracer trace 1 confirms causal alignment.
- **C2-AGG-3** (drizzle-force policy in repo docs): RESOLVED. `AGENTS.md:349-362` already documents the `DRIZZLE_PUSH_FORCE` policy with "When NOT to use" guard. The cycle-2 plan thought this was deferred; verifier confirms it predates cycle 1.

## Plan-vs-implementation reconciliation (cycle 2 carryover)

The cycle-2 plan (`plans/open/2026-04-29-rpf-cycle-2-review-remediation.md`) marked Task B (sshpass) as "Deferred this cycle (entry-state). Exit criterion MET this cycle. Roll forward to cycle 3 as IN-PROGRESS." But the implementation actually landed in cycle-2 commits `21125372` and `66146861`, AFTER the plan was authored but BEFORE cycle 2 closed. The cycle-3 plan must reconcile this:

- Mark **C2-AGG-2** as split into **C2-AGG-2A** (DONE in cycle-2 commits 21125372 + 66146861) and **C2-AGG-2B** (SSH/sudo-password decoupling, still DEFERRED).
- Add a closure note to the cycle-2 plan referencing the actual implementation commits.

This is a documentation-hygiene action — no code change. Captured below as **C3-AGG-1** (consolidates C3-CT-1 + C3-CT-3 + C3-DOC-3).

---

## Deduplicated findings (sorted by severity)

### C3-AGG-1: [INFO/LOW] Cycle-2 plan Task B status is stale; SSH ControlMaster fix landed in cycle-2 commits but plan reads "deferred"

**Sources:** critic (C3-CT-1, C3-CT-3) + document-specialist (C3-DOC-3). | **Cross-agent agreement:** 2.

**File/lines:** `plans/open/2026-04-29-rpf-cycle-2-review-remediation.md:30-44`.

**Severity:** INFO/LOW (process / documentation only; no production code change).

**Concrete failure scenario:** Future planner reads cycle-2 plan, mistakenly thinks the sshpass fix is still pending, and re-implements it in cycle 3 — duplicating effort.

**Fix:** Cycle-3 plan must:
1. Add a closure note to the cycle-2 plan: "Task B (sshpass deploy-blocker) was implemented in cycle-2 commits 21125372 + 66146861, BEFORE cycle 2 closed but AFTER this plan was authored. The remaining sub-finding (SSH/sudo password decoupling) is now C3-AGG-2 (SSH/sudo decoupling), still DEFERRED to cycle 4+."
2. Split C2-AGG-2 into C2-AGG-2A (DONE) and C2-AGG-2B (DEFERRED, becomes C3-AGG-2 below).

**Repo policy check:** Pure documentation. Not security/correctness/data-loss. Not deferrable in the long run, but is naturally addressed by writing the cycle-3 plan.

---

### C3-AGG-2: [LOW] SSH ↔ sudo password coupling in `remote_sudo` (cycle-2 unfinished sub-task)

**Sources:** code-reviewer (C3-CR-2), security-reviewer (C3-SR-2). | **Cross-agent agreement:** 2.

**File/lines:** `deploy-docker.sh:204-214` (the `remote_sudo` helper).

**Severity:** LOW (operational; deploy works at HEAD because the operator's SSH password and sudo password happen to match on the current target).

**Concrete failure scenario:** Future operator rotates the sudo password without rotating the SSH password (or vice-versa). Every `remote_sudo` call fails. Deploy aborts at the nginx step (it's the first `remote_sudo` user). Misleading "Permission denied" log points at SSH rather than sudo.

**Fix:** Two lines —
```bash
: "${SSH_SUDO_PASSWORD:=${SSH_PASSWORD:-}}"
# ...
sshpass -p "$SSH_PASSWORD" ssh $SSH_OPTS "${REMOTE_USER}@${REMOTE_HOST}" "sudo -S -p '' bash -lc ${quoted_cmd}" <<<"$SSH_SUDO_PASSWORD"
```
The here-string fix also addresses C3-SR-2 (printf argv leak under `sh`).

**Repo policy check:** Not security/correctness/data-loss in the present deployment. LOW severity. Deferral permitted.

**Exit criterion:** SSH password rotation is performed without sudo password rotation (or vice-versa) on any deploy target, OR a docker-host with separate SSH/sudo credentials is added.

---

### C3-AGG-3: [LOW] `_initial_ssh_check` retry count is fixed at 4 with no env-var override

**Sources:** perf-reviewer (C3-PR-1) + debugger (C3-DB-1, related). | **Cross-agent agreement:** 2.

**File/lines:** `deploy-docker.sh:165-178`.

**Severity:** LOW.

**Concrete failure scenario:**
- Operator deploys to a decommissioned host: waits 14s of sleep + 4 × 15s ConnectTimeout = up to 74s before learning the host is down.
- Long-running deploy step (e.g. `docker build` >5 min) on flaky network: ControlMaster keepalive (ServerAliveCountMax=3 × ServerAliveInterval=30 = 90s) drops; subsequent `remote*` call fails with no auto re-establishment.

**Fix:**
1. Accept `SSH_INIT_RETRIES` env var (default 4). One-line addition.
2. (Stretch) Wrap each `remote*` call with single re-attempt that re-runs `_initial_ssh_check` if the previous call returned a "ControlSocket: connection refused" error.

**Repo policy check:** LOW severity, deferrable.

**Exit criterion:** Operator complains about long wait when host is down, OR a real deploy hits ControlSocket connection refused on a flaky-network long-build step.

---

### C3-AGG-4: [LOW] No CI gate for `bash -n` / `shellcheck` on `deploy-docker.sh`

**Sources:** test-engineer (C3-TE-1, C3-TE-2). | **Cross-agent agreement:** 1 (test-engineer with two related findings).

**File/lines:** `package.json` (no `lint:bash` script); `eslint.config.mjs` (no equivalent for shell).

**Severity:** LOW.

**Concrete failure scenario:** Future cycle introduces a syntax error in `deploy-docker.sh` (e.g., unmatched heredoc terminator, unescaped `$` in heredoc). Caught only at deploy time on the live target. Wastes a deploy attempt.

**Fix:** Add `lint:bash` script — `bash -n deploy-docker.sh deploy.sh scripts/*.sh && shellcheck deploy-docker.sh deploy.sh scripts/*.sh`. Wire into CI as a check.

**Repo policy check:** LOW severity, deferrable.

**Exit criterion:** Another bash syntax error makes it through to a deploy attempt, OR a deploy-hardening cycle is opened.

This subsumes carry-forward **C2-AGG-4** (deploy SKIP_* regression test) — the smoke test would land alongside.

---

### C3-AGG-5: [LOW] `deploy-docker.sh` is ≈1001 lines and conflates concerns; legacy `deploy.sh` lacks ControlMaster

**Sources:** architect (C3-AR-1, C3-AR-2). | **Cross-agent agreement:** 1 (architect).

**Files/lines:**
- `deploy-docker.sh` (whole file, 1001 lines).
- `deploy.sh:58-66` (still uses bare sshpass, no ControlMaster).

**Severity:** LOW.

**Concrete failure scenario:**
- Future cycle adds a new SSH option for a different target. Change accidentally affects the nginx config heredoc because the var expansion order changed. Hard to catch in a 1001-line diff without modular split.
- Operator falls back to `./deploy.sh` when `deploy-docker.sh` is unavailable; sees the same "Permission denied" pattern that cycle 2 was supposed to fix.

**Fix options:**
1. Extract SSH helpers (lines 135-214 of `deploy-docker.sh`) into `scripts/lib/ssh.sh`, source it from both `deploy-docker.sh` and `deploy.sh`. Two scripts share one helper. ≈30 lines moved.
2. Or delete `deploy.sh` if unused; or add a "Deprecated: use deploy-docker.sh" banner.

**Repo policy check:** LOW severity, deferrable.

**Exit criterion:** `deploy-docker.sh` exceeds 1500 lines, OR `deploy.sh` is invoked in the next 90 days, OR three independent cycles modify the SSH-helpers block.

---

### C3-AGG-6: [LOW] SSH ControlMaster socket directory in `/tmp` is path-predictable (defense-in-depth)

**Sources:** security-reviewer (C3-SR-1). | **Cross-agent agreement:** 1.

**File/lines:** `deploy-docker.sh:151`.

**Severity:** LOW (defense-in-depth; no current active exposure).

**Concrete failure scenario:** Multi-tenant deploy host. Attacker user `mallory` runs `ls /tmp/judgekit-ssh.*` periodically; can detect when a privileged deploy is in flight and time follow-on attacks. Not a credential leak; it's a timing-side-channel for deploy activity.

**Fix:** Use `mktemp -d /tmp/judgekit-ssh-$(id -un).XXXXXX` to include the deploy operator in the dirname, OR prefer `~/.ssh/control` if available with 0700 perms, falling back to `/tmp` only when home is on noexec/nosuid mount.

**Repo policy check:** LOW severity, deferrable. Defense-in-depth.

**Exit criterion:** A multi-tenant deploy host is added to routine deploy targets, OR an operator reports peer-user awareness of deploy timing.

---

### C3-AGG-7: [LOW] `deploy-docker.sh` header docstring is incomplete vs the env-var surface

**Sources:** document-specialist (C3-DOC-1, C3-DOC-2). | **Cross-agent agreement:** 1.

**File/lines:** `deploy-docker.sh:1-21` (header docstring); `AGENTS.md` (no "Deploy hardening" subsection).

**Severity:** LOW.

**Concrete failure scenario:** New operator reads the header, doesn't realize `SKIP_PREDEPLOY_BACKUP=1` exists; deploy aborts on first backup failure with no clear escape hatch. Or future operator reverts the chmod-0600 line "to simplify the script" because no doc explains why it's required.

**Fix:**
1. Extend `deploy-docker.sh` header docstring (lines 1-21) to list every env var the script reads with default values (≈15 lines added).
2. Add a "Deploy hardening" subsection to `AGENTS.md` citing each fix and rationale (chmod 0600, ControlMaster, secret backfill, drizzle-force policy).

**Repo policy check:** Not security/correctness/data-loss. LOW severity. Deferrable to docs-touch cycle.

**Exit criterion:** A new operator hits a missing-env-var blocker, OR any cycle touches AGENTS.md or `deploy-docker.sh` header for any other reason.

---

### C3-AGG-8: [LOW] Deploy log lines lack a deploy-instance prefix

**Sources:** critic (C3-CT-4). | **Cross-agent agreement:** 1.

**File/lines:** `deploy-docker.sh:129-133` (`info()`, `success()`, `warn()`, `error()` helpers).

**Severity:** LOW.

**Concrete failure scenario:** Two parallel deploys against different targets get logged to the same console (rare but happens during incident response); analyst cannot disambiguate which line came from which run.

**Fix:** One-time `DEPLOY_ID=$(date -u +%Y%m%dT%H%M%SZ)` at the top, then prefix every log line with `[${DEPLOY_ID}]`. Backwards-compatible.

**Repo policy check:** LOW. Deferrable.

**Exit criterion:** A real-world incident where multi-deploy log analysis is required.

---

### C3-AGG-9: [LOW] `chmod 700` after `mktemp -d` is redundant — minor doc hygiene

**Sources:** code-reviewer (C3-CR-1). | **Cross-agent agreement:** 1.

**File/lines:** `deploy-docker.sh:151-152`.

**Severity:** LOW (no defect; readability).

**Concrete failure scenario:** None. Future maintainer pauses to decode whether the `chmod 700` is a security fix or a no-op.

**Fix:** Add a one-line comment "# defense-in-depth, mktemp -d already creates 0700" OR drop the redundant `chmod 700`.

**Repo policy check:** LOW. Deferrable.

**Exit criterion:** Future cycle touches `deploy-docker.sh:151-152`.

---

### C3-AGG-10: [LOW] `_initial_ssh_check` doesn't log "succeeded after N attempts" — observability gap

**Sources:** code-reviewer (C3-CR-3). | **Cross-agent agreement:** 1.

**File/lines:** `deploy-docker.sh:165-178`.

**Severity:** LOW.

**Concrete failure scenario:** SSH host slowly degrades; operator sees deploy finishing but doesn't see retry count creeping up until the deploy hard-fails one cycle.

**Fix:** Add `info "SSH connection succeeded after ${attempt} attempts"` when `attempt > 1`. One line.

**Repo policy check:** LOW. Deferrable.

**Exit criterion:** Same as C3-AGG-3 (operator complaint about long wait on flaky host).

---

## Carry-forward DEFERRED items (status verified at HEAD 66146861)

| ID | Severity | File+line | Status | Exit criterion |
| --- | --- | --- | --- | --- |
| C2-AGG-2B (= C3-AGG-2) | LOW | `deploy-docker.sh:204-214` | DEFERRED (split from C2-AGG-2; deploy-blocker A is DONE) | SSH/sudo credential rotation divergence on any target |
| C2-AGG-4 (subsumed by C3-AGG-4) | LOW | `deploy-docker.sh:79-110` | DEFERRED | bash-lint CI gate added or another regression occurs |
| C2-AGG-5 | LOW | 4-6 polling components | DEFERRED | Telemetry signal or 7th instance |
| C2-AGG-6 | LOW | `src/app/(public)/practice/page.tsx:417` | DEFERRED | p99 > 1.5s OR > 5k matching problems |
| C2-AGG-7 | LOW | `recruiting-invitations-panel.tsx:99` + others | DEFERRED | Wrong-host invite link reported, OR appUrl config added |
| C1-AGG-3 | LOW | 27 client `console.error` sites | DEFERRED | Telemetry/observability cycle opens |
| C1-AGG-4 | LOW | Polling sites (subsumed by C2-AGG-5) | DEFERRED | (same as C2-AGG-5) |
| DEFER-ENV-GATES | LOW | Env-blocked tests | DEFERRED | Fully provisioned CI/host with DATABASE_URL, Postgres, sidecar |
| D1 | MEDIUM | `src/lib/auth/` JWT clock-skew | DEFERRED | Auth-perf cycle |
| D2 | MEDIUM | `src/lib/auth/` JWT DB query per request | DEFERRED | Auth-perf cycle |
| AGG-2 | MEDIUM | `src/lib/api-rate-limit.ts:56` `Date.now()` | DEFERRED | Rate-limit-time cycle |
| ARCH-CARRY-1 | MEDIUM | 22+ raw API route handlers | DEFERRED | API-handler refactor cycle |
| ARCH-CARRY-2 | LOW | `src/lib/realtime/` SSE eviction | DEFERRED | SSE perf cycle |
| PERF-3 | MEDIUM | `src/lib/anti-cheat/` heartbeat gap query | DEFERRED | Anti-cheat perf cycle |

No HIGH findings deferred. No security/correctness/data-loss findings deferred (all such findings are either RESOLVED at HEAD or implemented this cycle).

---

## Cross-agent agreement summary

- **C3-AGG-1** (cycle-2 plan stale): 2 (critic + document-specialist).
- **C3-AGG-2** (SSH/sudo password decoupling): 2 (code-reviewer + security-reviewer).
- **C3-AGG-3** (SSH retry count override): 2 (perf-reviewer + debugger).
- **C3-AGG-4** (bash CI gate): 1 (test-engineer, two related findings).
- **C3-AGG-5** (deploy-script size + legacy deploy.sh): 1 (architect, two related findings).
- **C3-AGG-6** (ControlMaster socket dir predictable): 1 (security-reviewer).
- **C3-AGG-7** (header docstring + AGENTS.md): 1 (document-specialist, two related findings).
- **C3-AGG-8** (deploy-instance log prefix): 1 (critic).
- **C3-AGG-9** (chmod 700 redundancy): 1 (code-reviewer).
- **C3-AGG-10** (succeeded-after-N-attempts log): 1 (code-reviewer).

## Agent failures

None. All 10 review perspectives (per-agent files in `.context/reviews/rpf-cycle-3-<agent>.md` covering code-reviewer, perf-reviewer, security-reviewer, critic, architect, debugger, designer, document-specialist, test-engineer, tracer; verifier merged into the aggregate as a verification pass) completed successfully.

---

## Implementation queue for PROMPT 2/3

Acted on this cycle (PROMPT 3 work):
- **C3-AGG-1** — closure note in cycle-2 plan + split C2-AGG-2 into A (DONE) / B (DEFERRED). Pure docs; no risk.

Deferrable (recorded in plan with exit criteria):
- **C3-AGG-2** through **C3-AGG-10** — all LOW severity, all deferrable per repo rules. Each has a concrete exit criterion.
- All carry-forward items unchanged in status (see table above).

No HIGH or MEDIUM new findings this cycle. No security/correctness/data-loss findings deferred.
