# RPF Cycle 3 Review Remediation Plan (orchestrator-driven, 2026-04-29)

**Date:** 2026-04-29
**Source:** `.context/reviews/_aggregate.md` (RPF cycle 3 orchestrator-driven) + `plans/user-injected/pending-next-cycle.md`
**Status:** IN PROGRESS

---

## Cycle prologue

- HEAD at start of cycle: `66146861` (per orchestrator history; production HEAD post cycle-2 deploy success).
- Cycle 2 closed: `chmod 0600 .env.production` shipped, SSH ControlMaster + ControlPath /tmp fix shipped, sshpass auth flake on `platform@10.50.1.116` resolved (verified by orchestrator: 0 "Permission denied" lines in cycle-3 deploy log).
- User-injected TODOs (`plans/user-injected/pending-next-cycle.md`): TODO #1 still CLOSED (cycle 1). No new entries. Re-read at cycle start; nothing to ingest.
- Pre-cycle gates assumed green per cycle-2 close-out (`npm run lint` 0, `npx tsc --noEmit` 0).

## Cycle-2 plan reconciliation

Per `_aggregate.md` finding **C3-AGG-1** (process / docs hygiene), the cycle-2 plan reads "Task B (sshpass) deferred this cycle. Roll forward to cycle 3." but cycle-2 commits `21125372` and `66146861` actually implemented the fix BEFORE cycle 2 closed. The cycle-2 plan was written between two of the implementation commits.

**Reconciliation actions taken in this cycle's plan:**

1. Cycle-2 plan Task B is RECLASSIFIED as cycle-2-DONE, not "DEFERRED to cycle 3 IN-PROGRESS". The exit criterion ("a third sshpass-related deploy failure") was met during cycle 2's deploy run, and the implementation landed in cycle-2's commit window.
2. The original C2-AGG-2 finding is split into:
   - **C2-AGG-2A** (sshpass deploy-blocker): DONE in cycle-2 commits `21125372` + `66146861`. No further action.
   - **C2-AGG-2B** (SSH/sudo password decoupling): still LOW, still DEFERRED. Carried forward as **C3-AGG-2** in this cycle's aggregate.
3. A closure note is appended to the cycle-2 plan (Task A below) documenting the implementation commits.

## Tasks

### Task A: [INFO/LOW — DOING THIS CYCLE] Append closure note to cycle-2 plan reconciling Task B implementation status

- **Source:** C3-AGG-1 (critic C3-CT-1, C3-CT-3 + document-specialist C3-DOC-3). Cross-agent agreement: 2.
- **Severity:** INFO/LOW (process/docs hygiene; no production code change).
- **Files:** `plans/open/2026-04-29-rpf-cycle-2-review-remediation.md` (Task B section, lines 30-44).
- **Concrete failure scenario:** Future planner reads cycle-2 plan, mistakenly thinks the sshpass fix is still pending, and re-implements it in cycle 3+ — duplicating effort.
- **Repo policy check:** Pure documentation. Not security/correctness/data-loss. Action this cycle, not deferred.
- **Plan:**
  1. Append a "**Cycle-3 closure note (2026-04-29):**" subsection inside Task B that:
     - Quotes the actual cycle-2 implementation commits (`21125372` and `66146861`).
     - Splits C2-AGG-2 into A (DONE) and B (DEFERRED → C3-AGG-2).
     - References this cycle's plan for the remaining decoupling work.
  2. No other content changes to the cycle-2 plan (preserves history).
- **Exit criterion:** Closure note appended; cycle-2 plan no longer carries a misleading "deferred" status for the implemented work.
- **Status:** [x] Done in this commit.

### Task B: [LOW — DEFERRED] SSH/sudo password decoupling in `remote_sudo` (C2-AGG-2B / C3-AGG-2)

- **Source:** C3-AGG-2 (code-reviewer C3-CR-2 + security-reviewer C3-SR-2). Cross-agent agreement: 2.
- **Severity (preserved):** LOW (operational; deploy works at HEAD because the operator's SSH and sudo passwords happen to match).
- **Files:** `deploy-docker.sh:204-214` (the `remote_sudo` helper).
- **Concrete failure scenario:** Future operator rotates the sudo password without rotating the SSH password (or vice-versa). Every `remote_sudo` call fails. Deploy aborts at the nginx step. Misleading "Permission denied" log points at SSH rather than sudo.
- **Reason for deferral:** Not blocking any current deploy target (cycle-3 deploy succeeded with shared password). The fix is also a behavior change (password var split) that needs a coordinated `.env.deploy` update on every target — bigger than the bug it prevents at LOW severity.
- **Repo policy check:** Not security/correctness/data-loss in the present deployment (LOW, operational, deploy-script-only). Per the deferred-fix rules in PROMPT 2: "Security, correctness, and data-loss findings are NOT deferrable unless the repo's own rules explicitly allow it." This is none of those — deferral permitted at LOW with explicit exit criterion.
- **Exit criterion:** SSH password rotation is performed without sudo password rotation (or vice-versa) on any deploy target, OR a docker-host with separate SSH/sudo credentials is added. Either trip applies the fix:
  ```bash
  : "${SSH_SUDO_PASSWORD:=${SSH_PASSWORD:-}}"
  # ...
  sshpass -p "$SSH_PASSWORD" ssh $SSH_OPTS "${REMOTE_USER}@${REMOTE_HOST}" "sudo -S -p '' bash -lc ${quoted_cmd}" <<<"$SSH_SUDO_PASSWORD"
  ```
- [x] Deferred this cycle.

### Task C: [LOW — DEFERRED] `_initial_ssh_check` retry count + ControlMaster keepalive observability (C3-AGG-3 + C3-AGG-10)

- **Source:** C3-AGG-3 (perf-reviewer C3-PR-1 + debugger C3-DB-1) + C3-AGG-10 (code-reviewer C3-CR-3). Cross-agent agreement: 2 + 1.
- **Severity (preserved):** LOW.
- **Files:** `deploy-docker.sh:165-178`.
- **Concrete failure scenario:**
  - Deploys to a decommissioned host wait up to 74s before failing.
  - Long-running deploy steps (>5 min) on flaky network can drop the master without auto re-establishment.
  - Operator cannot tell whether the SSH retry was needed or whether the host is healthy (no "succeeded after N attempts" log).
- **Reason for deferral:** Cycle-3 deploy succeeded on first attempt; no operational pain right now. Adding env-var-tunable retry count + auto-reconnect requires coordinated test on a flaky-network host, which doesn't exist in the cycle's dev shell.
- **Repo policy check:** LOW severity, operational. Deferral permitted.
- **Exit criterion:** Operator complains about long wait when host is down, OR a real deploy hits "ControlSocket connection refused" on a flaky-network long-build step.
- [x] Deferred this cycle.

### Task D: [LOW — DEFERRED] Bash CI gate (`bash -n` + `shellcheck`) (C3-AGG-4)

- **Source:** C3-AGG-4 (test-engineer C3-TE-1 + C3-TE-2). Subsumes carry-forward C2-AGG-4.
- **Severity (preserved):** LOW.
- **Files:** `package.json` (no `lint:bash` script); `eslint.config.mjs` (no shell coverage).
- **Concrete failure scenario:** Future cycle introduces a syntax error in `deploy-docker.sh` (e.g., unmatched heredoc terminator). Caught only at deploy time. Wastes a deploy attempt.
- **Reason for deferral:** Adding a CI gate requires deciding where to host CI (the repo's CI surface is not visible in this dev shell). Setting up `shellcheck` as an npm script + adding it to a CI step is best done in a deploy-hardening cycle that also adds the C2-AGG-4 smoke test.
- **Repo policy check:** LOW severity, deployment-script-only. Deferral permitted.
- **Exit criterion:** Another bash syntax error makes it through to a deploy attempt, OR a deploy-hardening cycle is opened.
- [x] Deferred this cycle.

### Task E: [LOW — DEFERRED] `deploy-docker.sh` modular extraction + legacy `deploy.sh` cleanup (C3-AGG-5)

- **Source:** C3-AGG-5 (architect C3-AR-1 + C3-AR-2). Cross-agent agreement: 1 (architect with two related findings).
- **Severity (preserved):** LOW.
- **Files:**
  - `deploy-docker.sh` (whole 1001-line file).
  - `deploy.sh:58-66` (legacy entrypoint, no ControlMaster).
- **Concrete failure scenario:**
  - Future cycle that adds a new SSH option accidentally affects the nginx config heredoc.
  - Operator falls back to `./deploy.sh`; sees the cycle-2 sshpass pattern recur.
- **Reason for deferral:** Refactor risk vs. benefit at the current line-count. Architect's exit criterion ("exceeds 1500 lines") is an objective trigger.
- **Repo policy check:** LOW severity, operational. Deferral permitted.
- **Exit criterion:** `deploy-docker.sh` exceeds 1500 lines, OR `deploy.sh` is invoked in the next 90 days, OR three independent cycles modify the SSH-helpers block.
- [x] Deferred this cycle.

### Task F: [LOW — DEFERRED] SSH ControlMaster socket dir path-predictability (C3-AGG-6)

- **Source:** C3-AGG-6 (security-reviewer C3-SR-1). Cross-agent agreement: 1.
- **Severity (preserved):** LOW (defense-in-depth; no current active exposure).
- **Files:** `deploy-docker.sh:151`.
- **Concrete failure scenario:** Multi-tenant deploy host. Attacker user can detect privileged deploy timing via `ls /tmp/judgekit-ssh.*`. Not a credential leak.
- **Reason for deferral:** No multi-tenant deploy host in the current target list. The directory is 0700, the socket is owner-only; attacker cannot connect, only enumerate timing.
- **Repo policy check:** Defense-in-depth, no current exposure. LOW severity. The CLAUDE.md "Secrets & Credentials" rule applies to writing secrets to files/logs; the ControlMaster socket is not a credential file. Deferral permitted.
- **Exit criterion:** A multi-tenant deploy host is added to routine deploy targets, OR an operator reports peer-user awareness of deploy timing.
- [x] Deferred this cycle.

### Task G: [LOW — DEFERRED] Documentation hygiene — `deploy-docker.sh` header + AGENTS.md "Deploy hardening" subsection (C3-AGG-7)

- **Source:** C3-AGG-7 (document-specialist C3-DOC-1 + C3-DOC-2). Cross-agent agreement: 1 (with two related findings).
- **Severity (preserved):** LOW.
- **Files:**
  - `deploy-docker.sh:1-21` (header docstring).
  - `AGENTS.md` (no "Deploy hardening" subsection).
- **Concrete failure scenario:** New operator misses an env-var escape hatch (e.g. `SKIP_PREDEPLOY_BACKUP=1`). Or future operator reverts chmod-0600 "to simplify the script" because no doc explains the rationale.
- **Reason for deferral:** Pure documentation; no runtime impact. Should land alongside the next cycle that touches `AGENTS.md` for any other reason.
- **Repo policy check:** Not security/correctness/data-loss. LOW severity. Deferral permitted.
- **Exit criterion:** A new operator hits a missing-env-var blocker, OR any cycle touches AGENTS.md or `deploy-docker.sh` header for any other reason.
- [x] Deferred this cycle.

### Task H: [LOW — DEFERRED] Deploy-instance log prefix (C3-AGG-8)

- **Source:** C3-AGG-8 (critic C3-CT-4). Cross-agent agreement: 1.
- **Severity (preserved):** LOW.
- **Files:** `deploy-docker.sh:129-133` (`info()`, `success()`, `warn()`, `error()` helpers).
- **Concrete failure scenario:** Two parallel deploys against different targets logged to the same console (rare but happens during incident response); analyst cannot disambiguate.
- **Reason for deferral:** No incident has surfaced this need. Bundled with C3-AGG-5 (modular extraction) since both touch the helpers block.
- **Repo policy check:** LOW. Deferral permitted.
- **Exit criterion:** A real-world incident where multi-deploy log analysis is required.
- [x] Deferred this cycle.

### Task I: [LOW — DEFERRED] Code hygiene — `chmod 700` redundancy comment + "succeeded after N attempts" log (C3-AGG-9 + C3-AGG-10)

- **Source:** C3-AGG-9 (code-reviewer C3-CR-1) + C3-AGG-10 (code-reviewer C3-CR-3). Cross-agent agreement: 1 each.
- **Severity (preserved):** LOW each.
- **Files:** `deploy-docker.sh:151-152` (chmod 700) and `deploy-docker.sh:165-178` (`_initial_ssh_check`).
- **Concrete failure scenario:** Future maintainer pauses to decode whether the redundant `chmod 700` is a security fix or a no-op. Operator missed degradation signal because retry-success is silent.
- **Reason for deferral:** Pure code-hygiene; no runtime impact. Should land alongside the next cycle that touches the `_initial_ssh_check` block.
- **Repo policy check:** LOW. Deferral permitted.
- **Exit criterion:** Future cycle touches `deploy-docker.sh:151-178` for any other reason.
- [x] Deferred this cycle.

### Task Z: [INFO — DONE] Run all configured gates and the deploy

- **Source:** Orchestrator GATES + DEPLOY_MODE.
- **Result:**
  1. `npm run lint`: exit 0 (clean, no output).
  2. `npx tsc --noEmit`: exit 0 (clean, no output).
  3. `npm run build`: exit 0 (Next.js 16 build complete, all routes compiled including `(public)`, `(dashboard)`, `(auth)`).
  4. `bash -n deploy-docker.sh` AND `bash -n deploy.sh`: exit 0 (both syntax-clean). Cheap evidence for C3-AGG-4 deferral.
  5. `npm run test:unit` / `test:integration` / `test:component` / `test:security` / `test:e2e`: NOT RE-RUN this cycle. Pre-existing env failures (DATABASE_URL not set, no rate-limiter sidecar, Playwright webServer cannot start) are tracked under cycle-1 Task H and cycle-2 Task Z as the DEFER-ENV-GATES carry-forward. My cycle-3 changes touch ONLY documentation/plans (no `src/` files modified). Test runtime cannot be affected. Per cycle-1 Task H exit criterion: "fully provisioned CI/host with DATABASE_URL, reachable Postgres, rate-limiter sidecar, Playwright browsers" — no change in env this cycle.
  6. Per-cycle deploy (`SKIP_LANGUAGES=true BUILD_WORKER_IMAGE=false INCLUDE_WORKER=false ./deploy-docker.sh`):
     - Pre-flight SSH check: OK (`SSH connection to 10.50.1.116 verified`). 0 "Permission denied" lines — cycle-2's ControlMaster fix verified working.
     - Source rsync: OK.
     - App image build, postgres start, app container start: OK.
     - drizzle-kit push: "No changes detected" — production schema is in sync with HEAD.
     - ANALYZE: OK.
     - All containers started: OK.
     - Nginx config + reload: OK (`nginx -t` passed, `systemctl reload nginx` OK).
     - Deployment verification: `JudgeKit is responding (HTTP 200)`.
     - **Deployment complete!** at `http://oj-internal.maum.ai`.
- **GATE_FIXES count:** 0 error-level fixes (no error-level gate issues caused by this cycle's changes; all gates clean at HEAD).
- **DEPLOY result:** `per-cycle-success`.
- **Notable:** Cycle-2's ControlMaster + /tmp ControlPath fix is now verified end-to-end on a fresh deploy. The exit criterion for C2-AGG-2A ("0 Permission denied lines in cycle-3 deploy log") is fully met.
- [x] Done.

## Carry-forward DEFERRED items (status preserved)

| ID | Severity | Carry-forward exit criterion |
| --- | --- | --- |
| C2-AGG-5 | LOW | Telemetry signal or 7th visibility-aware-polling instance |
| C2-AGG-6 | LOW | Practice page p99 > 1.5s OR > 5k matching problems |
| C2-AGG-7 | LOW | Wrong-host invitation link reported, OR appUrl config added |
| C1-AGG-3 | LOW | Telemetry/observability cycle opens (27 console.error sites) |
| DEFER-ENV-GATES | LOW | CI/host with DATABASE_URL + Postgres + sidecar |
| D1, D2 | MEDIUM | Auth-perf cycle |
| AGG-2 | MEDIUM | Rate-limit-time cycle |
| ARCH-CARRY-1 | MEDIUM | API-handler refactor cycle |
| ARCH-CARRY-2 | LOW | SSE perf cycle |
| PERF-3 | MEDIUM | Anti-cheat perf cycle |

No HIGH/MEDIUM new findings deferred this cycle. No security/correctness/data-loss findings deferred (all such findings RESOLVED at HEAD or already implemented in cycle 2).

## Summary

- 1 task to implement this cycle: Task A (cycle-2 plan closure note).
- 8 tasks deferred (Tasks B-I) with file+line, severity preserved, concrete reasons, and exit criteria.
- All carry-forward DEFERRED items preserved.
- 0 user-injected TODOs to address.
- Deploy + gate run is the final in-cycle step (Task Z).
