# RPF Cycle 5 Review Remediation Plan (orchestrator-driven, 2026-04-29)

**Date:** 2026-04-29
**Source:** `.context/reviews/_aggregate.md` (RPF cycle 5 orchestrator-driven) + `plans/user-injected/pending-next-cycle.md`
**Status:** IN PROGRESS

---

## Cycle prologue

- HEAD at start of cycle: `2626aab6` (cycle-4 close-out: docs(plans) mark cycle 4 Task Z (gates+deploy) and Task ZZ (archive) done).
- Cycle 4 closed: 0 NEW findings, drew down 3 LOW deferred items (C3-AGG-7 deploy-script env-var docs, C3-AGG-9 chmod-700 comment, C3-AGG-10 succeeded-after-N-attempts log line). Deploy clean.
- User-injected TODOs (`plans/user-injected/pending-next-cycle.md`): TODO #1 still CLOSED (cycle 1 RPF). No new entries. Re-read at cycle start; nothing to ingest.
- Pre-cycle gates assumed green per cycle-4 close-out. Will re-verify in Task Z.
- Cycle change surface vs cycle-4 close-out HEAD `2626aab6`: empty (cycle 5 starts at HEAD = cycle-4 close-out).
- An earlier non-orchestrator cycle-5 review run (rooted at base commit `4c2769b2`) was found in `.context/reviews/`. Its actionable findings are RESOLVED at HEAD or subsumed by existing carry-forwards; the orchestrator-driven cycle-5 reviews are now authoritative.

## Cycle-4 plan reconciliation

The cycle-4 plan (`plans/open/2026-04-29-rpf-cycle-4-review-remediation.md`) is internally consistent at HEAD `2626aab6`:
- Tasks A, B, C done (commits `e657a96c`, `f5ac57ff`, `5cae08af`).
- Tasks D-J explicitly DEFERRED with exit criteria.
- Task Z recorded `per-cycle-success`.
- Task ZZ archived cycle-3 plan.

No reconciliation drift. Cycle-4 plan can be archived after this cycle's plan is published. **Action this cycle (Task ZZ):** move cycle-4 plan to `plans/done/`.

## Tasks

### Task A: [LOW — DOING THIS CYCLE] Add deploy-instance log prefix to logging helpers (closes C3-AGG-8)

- **Source:** C3-AGG-8 (cycle 3 critic C3-CT-4). Re-flagged this cycle as C5-CT-1 + cross-agreement from code-reviewer + debugger + architect.
- **Severity:** LOW.
- **Files:** `deploy-docker.sh:151-154` (the `info()`, `success()`, `warn()`, `error()` helpers).
- **Concrete failure scenario:** Two parallel deploys against different targets logged to the same console (e.g., side-by-side terminals during incident response); analyst cannot disambiguate which line came from which host.
- **Exit criterion (cycle 3):** "Real-world incident where multi-deploy log analysis is required." Adding the optional prefix gated behind an env var meets the spirit of the criterion proactively without waiting for incident.
- **Repo policy check:** Pure-additive shell-helper update; behavior unchanged when env var unset. LOW severity, deploy-script-only, not touching `src/lib/auth/config.ts`. Compliant with CLAUDE.md.
- **Plan:**
  1. Inside the helpers (`info`, `success`, `warn`, `error`), if `${DEPLOY_INSTANCE:-}` is non-empty, prefix the message with `[host=$DEPLOY_INSTANCE]`. Otherwise emit unchanged.
  2. Add `DEPLOY_INSTANCE` to the env-var docstring at `deploy-docker.sh:1-30`.
  3. Add `DEPLOY_INSTANCE` to the `AGENTS.md` "Deploy hardening" subsection.
- **Status:** [ ] Pending implementation.

### Task B: [LOW — DOING THIS CYCLE] Add `lint:bash` script invoking `bash -n` over deploy scripts (closes C3-AGG-4 / C2-AGG-4)

- **Source:** C3-AGG-4 (cycle 3 test-engineer C3-TE-1 + C3-TE-2). Subsumes C2-AGG-4. Re-flagged this cycle as C5-CR-2 + C5-AR-3 + cross-agreement test-engineer.
- **Severity:** LOW.
- **Files:** `package.json` (no `lint:bash` script currently).
- **Concrete failure scenario:** Future cycle introduces a syntax error in `deploy-docker.sh` (e.g., unmatched heredoc terminator). Caught only at deploy time, possibly after a mid-deploy partial-state.
- **Exit criterion (cycle 3):** "bash-lint CI gate added or another bash-syntax regression." Adding the npm script naturally meets the criterion (developer can run locally; CI integration is separate follow-up).
- **Repo policy check:** Pure-additive package.json script. No version bumps, no dependency churn. Compliant with CLAUDE.md.
- **Plan:**
  1. Add to `package.json` "scripts": `"lint:bash": "bash -n deploy-docker.sh && bash -n deploy.sh"` (only the two top-level deploy scripts; `scripts/*.sh` covered if needed in a follow-up).
  2. Optionally add to AGENTS.md a note that local `npm run lint:bash` is recommended before any deploy-script edit.
- **Status:** [ ] Pending implementation.

### Task C: [LOW — CLOSED, silently fixed] Recruiting invitations panel hardcoded appUrl (closes C2-AGG-7)

- **Source:** C2-AGG-7 (cycle 2 + cycle 3 + cycle 4 carry-forward).
- **Severity (preserved):** LOW.
- **Files (original):** `src/components/recruiting/recruiting-invitations-panel.tsx:99` (path).
- **HEAD inspection at `2626aab6`:**
  - File moved to `src/components/contest/recruiting-invitations-panel.tsx` (646 lines).
  - Line 99 reads `const baseUrl = typeof window !== "undefined" ? window.location.origin : "";` — the panel uses the browser-side origin, NOT a hardcoded `judgekit.dev` literal. `grep -rln "judgekit.dev" src/` returns 0 hits.
- **Resolution:** **CLOSED**. The hardcoded literal was silently fixed by intervening commit(s) (file refactor + path migration). No further action needed this cycle. Removing C2-AGG-7 from the deferred backlog.
- **Repo policy check:** Closure based on direct file inspection. No code change required from this cycle.
- **Status:** [x] Closed (silently fixed). No commit needed; record-keeping update only.

### Task D: [LOW — DEFERRED] SSH/sudo password decoupling in `remote_sudo` (carry-forward C3-AGG-2 / C2-AGG-2B)

- **Source:** C3-AGG-2 (cycle 3 code-reviewer + security-reviewer). Re-confirmed cycle 4 + cycle 5.
- **Severity (preserved):** LOW.
- **Files:** `deploy-docker.sh:204-214`.
- **Reason for deferral:** Not blocking any current deploy target. Behavior change requires coordinated `.env.deploy` update on every target. Same status as cycle 4.
- **Repo policy check:** LOW operational. Deferral permitted (CLAUDE.md / AGENTS.md do not mandate fix).
- **Exit criterion (carried):** SSH password rotation without sudo password rotation on any deploy target, OR a docker-host with separate SSH/sudo credentials is added.
- **Status:** [x] Deferred this cycle.

### Task E: [LOW — DEFERRED] `_initial_ssh_check` retry-count env-var override + ControlMaster keepalive auto-reconnect (carry-forward C3-AGG-3)

- **Source:** C3-AGG-3 (cycle 3 perf-reviewer + debugger). Re-confirmed cycle 4 + cycle 5.
- **Severity (preserved):** LOW.
- **Files:** `deploy-docker.sh:165-178`.
- **Reason for deferral:** Cycle-4 deploy succeeded on first attempt. Adding env-var-tunable retry count + auto-reconnect requires coordinated test on a flaky-network host, not available in this dev shell.
- **Exit criterion (carried):** Operator complains about long wait when host is down, OR a real deploy hits "ControlSocket connection refused" on a flaky-network long-build step.
- **Status:** [x] Deferred this cycle.

### Task F: [LOW — DEFERRED] `deploy-docker.sh` modular extraction + legacy `deploy.sh` cleanup (carry-forward C3-AGG-5)

- **Source:** C3-AGG-5 (cycle 3 architect). Re-confirmed cycle 4 + cycle 5.
- **Severity (preserved):** LOW.
- **Files:** `deploy-docker.sh` whole 1032-line file; `deploy.sh:58-66`.
- **Reason for deferral:** Refactor risk vs. benefit at current line-count. Architect's exit criterion (1500 lines) is the trigger.
- **Exit criterion (carried):** `deploy-docker.sh` exceeds 1500 lines, OR `deploy.sh` is invoked in the next 90 days, OR three independent cycles modify the SSH-helpers block. (Cycle 5 Task A modifies the helpers block — this is touch #2 since cycle 3 closed; one more touch triggers refactor.)
- **Status:** [x] Deferred this cycle.

### Task G: [LOW — DEFERRED] SSH ControlMaster socket dir path-predictability (carry-forward C3-AGG-6)

- **Source:** C3-AGG-6 (cycle 3 security-reviewer). Re-confirmed cycle 4 + cycle 5.
- **Severity (preserved):** LOW.
- **Files:** `deploy-docker.sh:151` (now `deploy-docker.sh` at the section, current line numbers may shift after Task A — exit-criterion text unchanged).
- **Reason for deferral:** No multi-tenant deploy host in current target list. Directory is 0700.
- **Exit criterion (carried):** Multi-tenant deploy host added OR peer-user awareness reported.
- **Status:** [x] Deferred this cycle.

### Task H: [LOW — DEFERRED, NEW] `scripts/deploy-worker.sh` sed delimiter collision risk (C5-SR-1)

- **Source:** C5-SR-1 (cycle 5 security-reviewer; subsumes a similar concern raised in the stale-base cycle-5 reviews).
- **Severity:** LOW (operator-supplied trusted input).
- **Files:** `scripts/deploy-worker.sh:101-107` (`ensure_env_var` function).
- **Concrete failure scenario:** Operator-supplied `--app-url` containing `|` or other sed-special characters causes the `sed -i` substitution to break or corrupt the remote `.env.production`.
- **Reason for deferral:** `APP_URL` is operator-supplied trusted input (the operator runs the deploy with their own URL); not external attacker input. No reported collision. Real URLs in current target list don't contain `|`.
- **Repo policy check:** LOW deploy-script-only, not security/correctness/data-loss in the application surface. Deferral permitted.
- **Exit criterion:** Untrusted-source `APP_URL` becomes a possibility (e.g., self-service deploy form) OR an operator reports a sed-pattern collision with a real URL.
- **Status:** [x] Deferred this cycle.

### Task I: [VARIOUS — DEFERRED, carry-forward] All `src/`-side deferred items unchanged

The `src/` tree did not change this cycle, so the carry-forward `src/` deferred items keep their status verbatim:

- **C2-AGG-5** — visibility-aware polling pattern duplication. Files: `src/components/submission-list-auto-refresh.tsx` + 5 others.
- **C2-AGG-6** — practice page Path B fetches all matching IDs in memory. File: `src/app/(public)/practice/page.tsx:417`.
- **C1-AGG-3** — client `console.error` sites. (Original count 27; spot-check shows 8 remaining in `src/components/`. Severity preserved at LOW; carry-forward stands.)
- **D1, D2** — auth JWT clock-skew + DB-per-request. Files under `src/lib/auth/`.
- **AGG-2** — `src/lib/api-rate-limit.ts:56` `Date.now()` in hot path.
- **ARCH-CARRY-1** — 22+ raw API route handlers don't use `createApiHandler`.
- **ARCH-CARRY-2** — `src/lib/realtime/` SSE eviction is O(n).
- **PERF-3** — `src/lib/anti-cheat/` heartbeat gap query.
- **DEFER-ENV-GATES** — env-blocked vitest integration / playwright e2e.

All keep their original severities and prior exit criteria. Deferral permitted per repo rules: none are HIGH; none are present-day security/correctness/data-loss findings.

- **Status:** [x] All deferred this cycle.

### Task Z: [INFO — PENDING] Run all configured gates and the deploy

- **Source:** Orchestrator GATES + DEPLOY_MODE.
- **Plan:**
  1. Run `npm run lint` (eslint).
  2. Run `npx tsc --noEmit`.
  3. Run `npm run build` (next build).
  4. Run `npm run test:unit` (vitest unit; expected DEFER-ENV-GATES).
  5. Run `npm run test:integration` (vitest integration; best-effort, DEFER-ENV-GATES).
  6. Run `npm run test:component` (vitest component; expected DEFER-ENV-GATES).
  7. Run `npm run test:security` (vitest security; expected DEFER-ENV-GATES).
  8. Run `npm run test:e2e` (playwright e2e; best-effort, browser binaries / Postgres harness may be unavailable).
  9. After all error-level gates green (or skipped with explanation), run `SKIP_LANGUAGES=true BUILD_WORKER_IMAGE=false INCLUDE_WORKER=false ./deploy-docker.sh` once.
  10. Record `DEPLOY: per-cycle-success` or `DEPLOY: per-cycle-failed:<reason>` in this plan.
- **Repo policy check:** Per cycle's run-context: must NOT preemptively set `DRIZZLE_PUSH_FORCE=1`. If a NEW destructive schema diff appears, halt deploy and report `per-cycle-failed:<reason>`.
- **Status:** [ ] Pending.

### Task ZZ: [INFO — PENDING] Archive cycle-4 plan to `plans/done/`

- **Source:** Orchestrator PROMPT 2 directive: "Archive plans which are fully implemented and done."
- **Plan:** Move `plans/open/2026-04-29-rpf-cycle-4-review-remediation.md` → `plans/done/2026-04-29-rpf-cycle-4-review-remediation.md`. Cycle-4 plan's actionable work is fully recorded (Tasks A/B/C done, D-J deferred with exit criteria, Z recorded `per-cycle-success`, ZZ done).
- **Repo policy check:** No code change. Documentation hygiene.
- **Status:** [ ] Pending.

---

## Gate-fix accounting (for cycle report)

- Errors fixed: 0 expected (lint/tsc/build clean per cycle-4 close-out; this cycle's diff is a few-line additive edit).
- Warnings fixed: 0.
- Suppressions added: 0.
- New defer entries: 1 (C5-SR-1, deferred with explicit exit criterion).
- Closed entries: 1 (C2-AGG-7, silently fixed by intervening commit).

## Cycle close-out checklist (in-progress)

- [ ] Tasks A, B committed (2 fine-grained commits, GPG-signed, conventional + gitmoji).
- [x] Task C closed (no commit; record-keeping in this plan).
- [x] Task ZZ to be done after Task A/B commits land.
- [x] Cycle-5 plan committed.
- [ ] All gates green or DEFER-ENV-GATES-skipped with explanation (Task Z).
- [ ] Deploy outcome recorded in this plan (Task Z).
- [ ] End-of-cycle report emitted by the orchestrator wrapper.
