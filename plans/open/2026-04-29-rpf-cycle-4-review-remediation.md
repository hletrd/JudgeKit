# RPF Cycle 4 Review Remediation Plan (orchestrator-driven, 2026-04-29)

**Date:** 2026-04-29
**Source:** `.context/reviews/_aggregate.md` (RPF cycle 4 orchestrator-driven) + `plans/user-injected/pending-next-cycle.md`
**Status:** IN PROGRESS

---

## Cycle prologue

- HEAD at start of cycle: `e61f8a91` (cycle-3 close-out: docs(plans) record cycle 3 deploy outcome — per-cycle-success).
- Cycle 3 closed: 0 NEW findings; 13 LOW + 1 INFO carry-forward findings deferred with concrete exit criteria; deploy clean (0 Permission-denied lines).
- User-injected TODOs (`plans/user-injected/pending-next-cycle.md`): TODO #1 still CLOSED (cycle 1). No new entries. Re-read at cycle start; nothing to ingest.
- Pre-cycle gates assumed green per cycle-3 close-out (`npm run lint` 0, `npx tsc --noEmit` 0). Will re-verify in Task Z.
- Cycle change surface vs cycle-3 working HEAD `66146861`: empty (cycle 3 was docs-only).

## Cycle-3 plan reconciliation

The cycle-3 plan (`plans/open/2026-04-29-rpf-cycle-3-review-remediation.md`) is internally consistent at the cycle-3 close-out commit `e61f8a91`:
- Task A done (cycle-2 closure note appended).
- Tasks B–I deferred with explicit exit criteria.
- Task Z recorded `per-cycle-success` for the deploy.

No reconciliation drift to fix. The cycle-3 plan can be archived after this cycle's plan is published, since all its actionable work is recorded as either DONE or DEFERRED with exit criteria. **Action this cycle:** move cycle-3 plan to `plans/done/` once cycle-4 plan is committed.

## Tasks

### Task A: [LOW — DOING THIS CYCLE] Document deploy-script env vars in `deploy-docker.sh` header + `AGENTS.md` "Deploy hardening" subsection (closes C3-AGG-7)

- **Source:** C3-AGG-7 (cycle 3 document-specialist C3-DOC-1 + C3-DOC-2). Cross-agent agreement: 1. Re-flagged this cycle as C4-DOC-1 + C4-DOC-2 + C4-CT-1.
- **Severity:** LOW (documentation; no runtime impact).
- **Files:**
  - `deploy-docker.sh:1-21` (header docstring).
  - `AGENTS.md` (no "Deploy hardening" subsection currently).
- **Concrete failure scenario:** New operator reads the header, doesn't realize `SKIP_PREDEPLOY_BACKUP=1` exists; deploy aborts on first backup failure with no clear escape hatch. Or future operator reverts the chmod-0600 line "to simplify the script" because no doc explains why it's required.
- **Exit criterion (cycle 3):** "any cycle touches AGENTS.md or `deploy-docker.sh` header for any other reason" — naturally met by this cycle's edit.
- **Repo policy check:** Pure documentation, no runtime impact. LOW severity. CLAUDE.md / AGENTS.md do not forbid documentation edits. The Korean letter-spacing rule is not relevant (no Korean content). No commit-config changes (still GPG-signed, conventional + gitmoji).
- **Plan:**
  1. Extend `deploy-docker.sh:1-21` header to enumerate every env var the script reads with default values: `SKIP_LANGUAGES`, `SKIP_BUILD`, `BUILD_WORKER_IMAGE`, `INCLUDE_WORKER`, `LANGUAGE_FILTER`, `SKIP_PREDEPLOY_BACKUP`, `AUTH_URL_OVERRIDE`, `DRIZZLE_PUSH_FORCE`. Add 1-line each.
  2. Add a "Deploy hardening" subsection to `AGENTS.md` citing each cycle-1/2/3 fix and its rationale: chmod 0600 `.env.production` (cycle 2), SSH ControlMaster + ControlPath /tmp (cycle 2), `_initial_ssh_check` retry (cycle 2), drizzle-force escalation policy (cycle 1, codified in cycle 2's existing `AGENTS.md` text).
- **Status:** [x] Done in commit `e657a96c`.

### Task B: [LOW — DOING THIS CYCLE] Clarify `chmod 700` redundancy after `mktemp -d` in `deploy-docker.sh` (closes C3-AGG-9)

- **Source:** C3-AGG-9 (cycle 3 code-reviewer C3-CR-1). Cross-agent agreement: 1. Re-flagged this cycle as C4-CT-1.
- **Severity:** LOW (readability; no defect).
- **Files:** `deploy-docker.sh:151-152`.
- **Concrete failure scenario:** Future maintainer pauses to decode whether the redundant `chmod 700` is a security fix or a no-op.
- **Exit criterion (cycle 3):** "Future cycle touches `deploy-docker.sh:151-152`" — naturally met by this cycle's edit.
- **Repo policy check:** Pure code-comment. Not security/correctness/data-loss. LOW severity.
- **Plan:** Insert a `# defense-in-depth — mktemp -d already creates 0700, this guards against unset umask` comment immediately above the existing `chmod 700 "$SSH_CONTROL_DIR"` line. Keep the chmod (defense-in-depth has value); do NOT remove it.
- **Status:** [x] Done in commit `f5ac57ff`.

### Task C: [LOW — DOING THIS CYCLE] Log "SSH connection succeeded after N attempts" in `_initial_ssh_check` (closes C3-AGG-10)

- **Source:** C3-AGG-10 (cycle 3 code-reviewer C3-CR-3). Cross-agent agreement: 1. Re-flagged this cycle as C4-CT-1 + C4-DB-1.
- **Severity:** LOW (observability gap; no functional defect).
- **Files:** `deploy-docker.sh:165-178`.
- **Concrete failure scenario:** SSH host slowly degrades; operator sees deploy finishing but doesn't see retry count creeping up until the deploy hard-fails one cycle.
- **Exit criterion (cycle 3):** "Future cycle touches `deploy-docker.sh:165-178`" — naturally met by this cycle's edit.
- **Repo policy check:** One-line code change, additive only. Not security/correctness/data-loss. LOW severity.
- **Plan:** Inside the `while` loop, after the `if remote "echo ok"` succeeds, emit `info "SSH connection succeeded after ${attempt} attempts"` only when `attempt -gt 1` (avoid log noise on happy path). One line of code, conditional on retry having been needed.
- **Status:** [x] Done in commit `5cae08af`.

### Task D: [LOW — DEFERRED] SSH/sudo password decoupling in `remote_sudo` (carry-forward C3-AGG-2 / C2-AGG-2B)

- **Source:** C3-AGG-2 (cycle 3 code-reviewer C3-CR-2 + security-reviewer C3-SR-2). Re-confirmed this cycle as C4-CR-1 + C4-SR-1.
- **Severity (preserved):** LOW (operational; deploy works at HEAD because operator's SSH and sudo passwords match).
- **Files:** `deploy-docker.sh:204-214` (the `remote_sudo` helper).
- **Concrete failure scenario:** Future operator rotates the sudo password without rotating the SSH password (or vice-versa). Every `remote_sudo` call fails. Deploy aborts at the nginx step.
- **Reason for deferral:** Not blocking any current deploy target. Behavior change requires coordinated `.env.deploy` update on every target.
- **Repo policy check:** Per CLAUDE.md / AGENTS.md, this is operational LOW deploy-script-only — not security/correctness/data-loss in the application surface. Deferral permitted.
- **Exit criterion:** SSH password rotation without sudo password rotation on any deploy target, OR a docker-host with separate SSH/sudo credentials is added.
- **Status:** [x] Deferred this cycle.

### Task E: [LOW — DEFERRED] `_initial_ssh_check` retry-count env-var override + ControlMaster keepalive auto-reconnect (carry-forward C3-AGG-3)

- **Source:** C3-AGG-3 (cycle 3 perf-reviewer C3-PR-1 + debugger C3-DB-1). Re-confirmed this cycle as C4-PR-1 + C4-CR-2.
- **Severity (preserved):** LOW.
- **Files:** `deploy-docker.sh:165-178`.
- **Concrete failure scenario:** Deploys to decommissioned host wait up to 74s before failing. Long-running deploy steps (>5 min) on flaky network can drop the master without auto re-establishment.
- **Reason for deferral:** Cycle-3 deploy succeeded on first attempt. Adding env-var-tunable retry count + auto-reconnect requires coordinated test on a flaky-network host, not available in this dev shell.
- **Repo policy check:** LOW operational. Deferral permitted.
- **Exit criterion:** Operator complains about long wait when host is down, OR a real deploy hits "ControlSocket connection refused" on a flaky-network long-build step.
- **Status:** [x] Deferred this cycle.

### Task F: [LOW — DEFERRED] Bash CI gate (`bash -n` + `shellcheck`) (carry-forward C3-AGG-4)

- **Source:** C3-AGG-4 (cycle 3 test-engineer C3-TE-1 + C3-TE-2). Subsumes carry-forward C2-AGG-4.
- **Severity (preserved):** LOW.
- **Files:** `package.json` (no `lint:bash` script); `eslint.config.mjs` (no shell coverage).
- **Concrete failure scenario:** Future cycle introduces a syntax error in `deploy-docker.sh` (e.g., unmatched heredoc terminator). Caught only at deploy time.
- **Reason for deferral:** Adding a CI gate requires deciding where to host CI (the repo's CI surface is not visible in this dev shell). Best done in a deploy-hardening cycle that also adds the C2-AGG-4 smoke test.
- **Repo policy check:** LOW deployment-script-only. Deferral permitted.
- **Exit criterion:** Another bash syntax error makes it through to a deploy attempt, OR a deploy-hardening cycle is opened.
- **Status:** [x] Deferred this cycle.

### Task G: [LOW — DEFERRED] `deploy-docker.sh` modular extraction + legacy `deploy.sh` cleanup (carry-forward C3-AGG-5)

- **Source:** C3-AGG-5 (cycle 3 architect C3-AR-1 + C3-AR-2). Re-confirmed this cycle as C4-AR-1 + C4-AR-2.
- **Severity (preserved):** LOW.
- **Files:** `deploy-docker.sh` whole 1001-line file; `deploy.sh:58-66` (legacy entrypoint, no ControlMaster).
- **Concrete failure scenario:** Future cycle that adds a new SSH option accidentally affects the nginx config heredoc. Operator falls back to `./deploy.sh` and sees the cycle-2 sshpass pattern recur.
- **Reason for deferral:** Refactor risk vs. benefit at current line-count. Architect's exit criterion ("exceeds 1500 lines") is an objective trigger.
- **Repo policy check:** LOW operational. Deferral permitted.
- **Exit criterion:** `deploy-docker.sh` exceeds 1500 lines, OR `deploy.sh` is invoked in the next 90 days, OR three independent cycles modify the SSH-helpers block.
- **Status:** [x] Deferred this cycle. (Cycle 4 *does* touch the SSH-helpers block via Task C, but only adds one log line — explicit cycle counter for the "3 cycles modify" trigger: this is touch #1 since cycle 3 closed.)

### Task H: [LOW — DEFERRED] SSH ControlMaster socket dir path-predictability (carry-forward C3-AGG-6)

- **Source:** C3-AGG-6 (cycle 3 security-reviewer C3-SR-1). Re-confirmed this cycle as C4-SR-3.
- **Severity (preserved):** LOW (defense-in-depth; no current active exposure).
- **Files:** `deploy-docker.sh:151`.
- **Concrete failure scenario:** Multi-tenant deploy host. Attacker user can detect privileged deploy timing via `ls /tmp/judgekit-ssh.*`. Not a credential leak.
- **Reason for deferral:** No multi-tenant deploy host in current target list. Directory is 0700.
- **Repo policy check:** Defense-in-depth, no current exposure. LOW. CLAUDE.md "Secrets & Credentials" rule applies to writing secrets to files/logs; the ControlMaster socket is not a credential file. Deferral permitted.
- **Exit criterion:** A multi-tenant deploy host is added to routine deploy targets, OR an operator reports peer-user awareness of deploy timing.
- **Status:** [x] Deferred this cycle.

### Task I: [LOW — DEFERRED] Deploy-instance log prefix (carry-forward C3-AGG-8)

- **Source:** C3-AGG-8 (cycle 3 critic C3-CT-4).
- **Severity (preserved):** LOW.
- **Files:** `deploy-docker.sh:129-133` (`info()`, `success()`, `warn()`, `error()` helpers).
- **Concrete failure scenario:** Two parallel deploys against different targets logged to the same console (rare but happens during incident response); analyst cannot disambiguate.
- **Reason for deferral:** No incident has surfaced this need. Bundled with C3-AGG-5 (modular extraction).
- **Repo policy check:** LOW. Deferral permitted.
- **Exit criterion:** A real-world incident where multi-deploy log analysis is required.
- **Status:** [x] Deferred this cycle.

### Task J: [VARIOUS — DEFERRED, carry-forward] All `src/`-side deferred items unchanged

The `src/` tree did not change this cycle, so the carry-forward `src/` deferred items keep their status verbatim:

- **C2-AGG-5** — visibility-aware polling pattern duplication. Files: `src/components/submission-list-auto-refresh.tsx` + 5 others.
- **C2-AGG-6** — practice page Path B fetches all matching IDs in memory. File: `src/app/(public)/practice/page.tsx:417`.
- **C2-AGG-7** — recruiting invitations panel hard-codes appUrl. File: `src/components/recruiting/recruiting-invitations-panel.tsx:99`.
- **C1-AGG-3** — 27 client `console.error` sites. Various files under `src/`.
- **D1, D2** — auth JWT clock-skew + DB-per-request. Files under `src/lib/auth/`.
- **AGG-2** — `src/lib/api-rate-limit.ts:56` `Date.now()` in hot path.
- **ARCH-CARRY-1** — 22+ raw API route handlers don't use `createApiHandler`.
- **ARCH-CARRY-2** — `src/lib/realtime/` SSE eviction is O(n).
- **PERF-3** — `src/lib/anti-cheat/` heartbeat gap query.
- **DEFER-ENV-GATES** — env-blocked vitest integration / playwright e2e.

All keep their original severities (LOW / LOW / LOW / LOW / MEDIUM / MEDIUM / MEDIUM / MEDIUM / LOW / MEDIUM / LOW respectively) and prior exit criteria. Deferral permitted per repo rules: none of these are HIGH; none are present-day security/correctness/data-loss findings (the MEDIUMs are perf/refactor scope).

- **Status:** [x] All deferred this cycle.

### Task Z: [INFO — DOING THIS CYCLE] Run all configured gates and the deploy

- **Source:** Orchestrator GATES + DEPLOY_MODE.
- **Plan:**
  1. Run `npm run lint` (eslint).
  2. Run `npx tsc --noEmit`.
  3. Run `npm run build` (next build).
  4. Run `npm run test:unit` (vitest unit).
  5. Run `npm run test:integration` (vitest integration; best-effort, may be DEFER-ENV-GATES-blocked).
  6. Run `npm run test:component` (vitest component).
  7. Run `npm run test:security` (vitest security).
  8. Run `npm run test:e2e` (playwright e2e; best-effort, browser binaries may be unavailable).
  9. After all gates green (or skipped with explanation), run `SKIP_LANGUAGES=true BUILD_WORKER_IMAGE=false INCLUDE_WORKER=false ./deploy-docker.sh` once.
  10. Record `DEPLOY: per-cycle-success` or `DEPLOY: per-cycle-failed:<reason>` in this plan and the cycle report.
- **Repo policy check:** Per cycle's run-context: must NOT preemptively set `DRIZZLE_PUSH_FORCE=1`. If a NEW destructive schema diff appears, halt deploy and report `per-cycle-failed:<reason>`.
- **Status:** [ ] To be done after Tasks A–C land.

### Task ZZ: [INFO — DOING THIS CYCLE] Archive cycle-3 plan to `plans/done/`

- **Source:** Orchestrator PROMPT 2 directive: "Archive plans which are fully implemented and done."
- **Plan:** Move `plans/open/2026-04-29-rpf-cycle-3-review-remediation.md` → `plans/done/2026-04-29-rpf-cycle-3-review-remediation.md`. The plan's actionable work is fully recorded (Task A done, Tasks B–I explicitly deferred with exit criteria, Task Z recorded `per-cycle-success`).
- **Repo policy check:** No code change. Documentation hygiene.
- **Status:** [ ] To be done in this cycle.

---

## Gate-fix accounting (for cycle report)

- Errors fixed: 0 expected (no gate errors at cycle start, will re-confirm in Task Z).
- Warnings fixed: 0 expected.
- Suppressions added: 0 (none should be needed).
- New defer entries (warnings unable to fix cleanly): TBD after Task Z.

## Cycle close-out checklist

- [ ] Tasks A, B, C committed (3 fine-grained commits, GPG-signed, conventional + gitmoji).
- [ ] Cycle-3 plan archived (Task ZZ).
- [ ] Cycle-4 plan committed (this file).
- [ ] All gates green (Task Z).
- [ ] Deploy outcome recorded in this plan (Task Z).
- [ ] End-of-cycle report emitted by the orchestrator wrapper.
