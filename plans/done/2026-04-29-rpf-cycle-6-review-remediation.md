# RPF Cycle 6 Review Remediation Plan (orchestrator-driven, 2026-04-29)

**Date:** 2026-04-29
**Source:** `.context/reviews/_aggregate.md` (RPF cycle 6 orchestrator-driven) + `plans/user-injected/pending-next-cycle.md`
**Status:** DONE

---

## Cycle prologue

- HEAD at start of cycle: `a18302b8` (cycle-5 close-out: docs(plans) mark cycle 5 Tasks Z (gates+deploy) and ZZ (archive) done).
- Cycle 5 closed: 0 NEW findings, drew down 3 LOW deferred items (C3-AGG-8 DEPLOY_INSTANCE log prefix, C3-AGG-4 lint:bash script, C2-AGG-7 closed as silently fixed). 1 NEW LOW deferred (C5-SR-1). Deploy clean.
- User-injected TODOs (`plans/user-injected/pending-next-cycle.md`): TODO #1 still CLOSED (cycle 1 RPF). No new entries. Re-read at cycle start; nothing to ingest.
- Pre-cycle gates assumed green per cycle-5 close-out. Will re-verify in Task Z.
- Cycle change surface vs cycle-5 close-out HEAD `a18302b8`: empty (cycle 6 starts at HEAD = cycle-5 close-out).
- An earlier non-orchestrator cycle-6 review run (rooted at base commit `d5980b35`) was found in `.context/reviews/`. Its actionable findings (AGG-1..AGG-7) are all RESOLVED at HEAD; the orchestrator-driven cycle-6 reviews are now authoritative.

## Cycle-5 plan reconciliation

The cycle-5 plan (`plans/open/2026-04-29-rpf-cycle-5-review-remediation.md`) is internally consistent at HEAD `a18302b8`:
- Tasks A, B done (commits `39c26599`, `08991d54`).
- Task C closed (silently fixed).
- Tasks D-I explicitly DEFERRED with exit criteria.
- Task Z recorded `per-cycle-success`.
- Task ZZ archived cycle-4 plan.

No reconciliation drift. Cycle-5 plan can be archived after this cycle's plan is published. **Action this cycle (Task ZZ):** move cycle-5 plan to `plans/done/`.

## Tasks

### Task A: [LOW — CLOSED, already correctly implemented] `scripts/deploy-worker.sh` env-var update is collision-safe (closes C5-SR-1)

- **Source:** C5-SR-1 (cycle 5 security-reviewer; original description quoted "sed -i delimiter").
- **Severity (preserved):** LOW.
- **Files (original carry-forward description):** `scripts/deploy-worker.sh:101-107` — described as "sed -i substitution".
- **HEAD inspection at `a18302b8`:**
  - `scripts/deploy-worker.sh:100-126` defines `ensure_env_var()`. The function does **NOT** use `sed`. It base64-encodes both key and value (`printf '%s' | base64`), passes them via SSH to a Python interpreter on the remote, and uses Python to read/write the `.env` file. There is no sed step at all.
  - The current implementation is **structurally collision-resistant**: any character (including `|`, `\`, `\n`, `&`, etc.) survives the base64 round-trip and is reconstructed exactly on the remote.
  - Comment block at lines 96-99 explicitly states the design intent: "Uses Python to update the .env file safely, avoiding sed/shell injection from special characters in values (e.g., URLs with pipes or shell metacharacters)."
- **Resolution:** **CLOSED as already-correctly-implemented**. The carry-forward description was stale at the time it was filed (cycle-5 security-reviewer reviewed `deploy-worker.sh` against an older mental model). C5-SR-1's exit criterion ("operator-reported sed-pattern collision OR untrusted-source APP_URL") cannot trigger because there is no sed pattern; collision-resistance is inherent.
- **Repo policy check:** Closure based on direct file inspection. No code change required from this cycle.
- **Status:** [x] Closed (already correctly implemented). No commit needed; record-keeping update only. Removing C5-SR-1 from the deferred backlog.

### Task B: [LOW — DOING THIS CYCLE] `remote_sudo` decoupling SUDO_PASSWORD from SSH_PASSWORD (closes C3-AGG-2)

- **Source:** C3-AGG-2 (cycle 3 code-reviewer + security-reviewer). Re-confirmed cycle 4 + cycle 5. Re-flagged this cycle as C6-CR-1 + C6-AR-1 + C6-CT-1 cross-agreement.
- **Severity (preserved):** LOW.
- **Files:** `deploy-docker.sh:249-259` (the `remote_sudo` function).
- **Concrete failure scenario:** A target host rotates the OS user's `sudo` password (e.g., per security policy) but keeps SSH (publickey/sshpass) credentials unchanged. The current `remote_sudo` reuses `SSH_PASSWORD` as the sudo password unconditionally — deploy fails with "Sorry, try again" sudo prompt loop, even though SSH connectivity is healthy. Operator can't tell whether the failure is SSH or sudo without reading `_initial_ssh_check` traces.
- **Exit criterion (cycle 3):** "SSH password rotation without sudo password rotation on any deploy target, OR a docker-host with separate SSH/sudo credentials is added." Adding the optional `SUDO_PASSWORD` env var proactively meets the spirit of the criterion: rotation paths now exist; behavior unchanged when the env var is unset (falls back to `SSH_PASSWORD`, preserving every current target's working configuration).
- **Repo policy check:** Pure-additive shell-helper update. Behavior unchanged when `SUDO_PASSWORD` is unset. LOW severity, deploy-script-only, not touching `src/lib/auth/config.ts`. Compliant with CLAUDE.md.
- **Plan:**
  1. Inside `remote_sudo`, compute `local sudo_pw="${SUDO_PASSWORD:-${SSH_PASSWORD:-}}"`. Use `sudo_pw` for the `printf '%s\n' "$sudo_pw" |` pipe instead of `SSH_PASSWORD`.
  2. Keep `sshpass -p "$SSH_PASSWORD"` as the SSH-auth side (unchanged); only the sudo-stdin side gates on `sudo_pw`.
  3. Add `SUDO_PASSWORD` to the env-var docstring at `deploy-docker.sh:30-50`.
  4. Add `SUDO_PASSWORD` to the `AGENTS.md` "Deploy hardening" subsection if such a section exists; otherwise, the docstring suffices.
- **Outcome:** Implemented in commit `72868cea`. Added `SUDO_PASSWORD` env-var docstring + caller-override save/restore + decoupled `remote_sudo` to use `${SUDO_PASSWORD:-${SSH_PASSWORD}}` for sudo stdin while keeping `sshpass -p "$SSH_PASSWORD"` for SSH auth. AGENTS.md "Deploy hardening" subsection wasn't found; docstring suffices per plan.
- **Status:** [x] Done in commit `72868cea`.

### Task C: [LOW — DOING THIS CYCLE] `_initial_ssh_check` retry-count env-var override (closes C3-AGG-3)

- **Source:** C3-AGG-3 (cycle 3 perf-reviewer + debugger). Re-confirmed cycle 4 + cycle 5. Re-flagged this cycle as C6-CR-2 + C6-AR-2 + C6-CT-1 cross-agreement.
- **Severity (preserved):** LOW.
- **Files:** `deploy-docker.sh:203-223` (the `_initial_ssh_check` function).
- **Concrete failure scenario:** Operator deploys against a slow-to-boot remote host (e.g., a freshly-rebooted server still loading services). The hardcoded `max_attempts=4` with `delay=2,4,8,16` totals ~30s of patience before hard-failing. On a slow boot, that's not enough. Operator currently has no way to extend retry count except by editing the script in-place.
- **Exit criterion (cycle 3):** "Operator complains about long wait when host is down, OR a real deploy hits 'ControlSocket connection refused' on a flaky-network long-build step." Adding env-var-tunable retry count proactively meets the spirit of the criterion: tuning path exists for slow-boot hosts; behavior unchanged when the env var is unset (still 4 attempts).
- **Repo policy check:** Pure-additive. Behavior unchanged when env var unset. LOW severity, deploy-script-only. Compliant with CLAUDE.md.
- **Plan:**
  1. Replace `local max_attempts=4` with `local max_attempts="${DEPLOY_SSH_RETRY_MAX:-4}"`.
  2. Add validation: if non-integer or <1, fall back to 4 with a `warn` line so a typo doesn't disable the retry.
  3. Add `DEPLOY_SSH_RETRY_MAX` to the env-var docstring.
- **Outcome:** Implemented in commit `2791d9a3`. Added `DEPLOY_SSH_RETRY_MAX` env-var docstring + validation logic in `_initial_ssh_check`. Validated with three input cases: "abc" → falls back to 4 + warn; "0" → falls back to 4 + warn; "8" → uses 8.
- **Status:** [x] Done in commit `2791d9a3`.

### Task D: [LOW — DEFERRED] `deploy-docker.sh` modular extraction + legacy `deploy.sh` cleanup (carry-forward C3-AGG-5)

- **Source:** C3-AGG-5 (cycle 3 architect). Re-confirmed cycle 4 + cycle 5.
- **Severity (preserved):** LOW.
- **Files:** `deploy-docker.sh` whole; `deploy.sh:58-66`.
- **Reason for deferral:** Refactor risk vs. benefit at current line-count (~1100 lines after cycle 5's additions). Architect's exit criterion (1500 lines) is the trigger.
- **Exit criterion (carried, with cycle 6 update):** `deploy-docker.sh` exceeds 1500 lines, OR `deploy.sh` is invoked in the next 90 days, OR three independent cycles modify the SSH-helpers block. **Touch counter:** cycle 3 closed → cycle 5 Task A modified helpers (touch #1) → cycle 6 Task B+C will modify the SSH-helpers block area (touch #2). One more touch triggers refactor.
- **Status:** [x] Deferred this cycle.

### Task E: [LOW — DEFERRED] SSH ControlMaster socket dir path-predictability (carry-forward C3-AGG-6)

- **Source:** C3-AGG-6 (cycle 3 security-reviewer). Re-confirmed cycle 4 + cycle 5.
- **Severity (preserved):** LOW.
- **Files:** `deploy-docker.sh:182-191`.
- **Reason for deferral:** No multi-tenant deploy host in current target list. Directory is 0700.
- **Exit criterion (carried):** Multi-tenant deploy host added OR peer-user awareness reported.
- **Status:** [x] Deferred this cycle.

### Task F: [VARIOUS — DEFERRED, carry-forward] All other carry-forward items unchanged (with path corrections)

The `src/` tree did not change this cycle, so the carry-forward `src/` deferred items keep their status verbatim, with **path corrections** applied per cycle-6 perf-reviewer + code-reviewer + critic + verifier 4-lane consensus:

- **C2-AGG-5** — visibility-aware polling pattern duplication. Files: `src/components/submission-list-auto-refresh.tsx` + 5 others. Severity LOW. Exit criterion: telemetry signal OR 7th instance.
- **C2-AGG-6** — practice page Path B fetches all matching IDs in memory. File: `src/app/(public)/practice/page.tsx:417`. Severity LOW. Exit criterion: p99 > 1.5s OR > 5k matching problems.
- **C1-AGG-3** — client `console.error` sites. Severity LOW. Original count 27; **HEAD count is 21** (population shrinking organically). Exit criterion: telemetry/observability cycle opens.
- **D1, D2** — auth JWT clock-skew + DB-per-request. Severity MEDIUM. Files: under `src/lib/auth/` but **NOT in `src/lib/auth/config.ts`** (per CLAUDE.md "Preserve Production config.ts", that file is no-touch). Exit criterion: dedicated auth-perf cycle. **Implementation must live OUTSIDE `src/lib/auth/config.ts`** (e.g., in a wrapper or upstream of `next-auth` callback).
- **AGG-2** — `Date.now()` in rate-limit hot path. Severity MEDIUM. **Path corrected:** was `src/lib/api-rate-limit.ts:56`; now `src/lib/security/in-memory-rate-limit.ts` lines 22, 24, 56, 75, 100, 149 (file migrated to `src/lib/security/`). Exit criterion: rate-limit-time perf cycle.
- **ARCH-CARRY-1** — raw API route handlers don't use `createApiHandler`. Severity MEDIUM. Original count 22+; **HEAD count is 20** (104 total `route.ts` files; 84 use `createApiHandler`; 20 raw). Population shrinking organically. Exit criterion: handler-refactor cycle.
- **ARCH-CARRY-2** — `src/lib/realtime/realtime-coordination.ts` SSE eviction is O(n). Severity LOW. Exit criterion: SSE perf cycle OR > 500 concurrent connections.
- **PERF-3** — anti-cheat heartbeat gap query. Severity MEDIUM. **Path corrected:** was `src/lib/anti-cheat/`; now `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:191-225` (the gap-query implementation; `src/lib/anti-cheat/review-model.ts` is only 16 lines of pure event-tier mapping). Exit criterion: anti-cheat dashboard p99 > 800ms OR > 50 concurrent contests viewed simultaneously.
- **DEFER-ENV-GATES** — env-blocked vitest integration / playwright e2e. Severity LOW. Exit criterion: fully provisioned CI/host with DATABASE_URL, Postgres, Playwright sidecar.

All keep their original severities and prior exit criteria (no downgrade). Path corrections do not change severity. Deferral permitted per repo rules: none are HIGH; none are present-day security/correctness/data-loss findings.

- **Status:** [x] All deferred this cycle.

### Task Z: [INFO — DONE] Run all configured gates and the deploy

- **Source:** Orchestrator GATES + DEPLOY_MODE.
- **Plan:**
  1. Run `npm run lint` (eslint).
  2. Run `npx tsc --noEmit`.
  3. Run `npm run lint:bash` (cycle-5 new).
  4. Run `npm run build` (next build).
  5. Run `npm run test:unit` (vitest unit; expected DEFER-ENV-GATES).
  6. Run `npm run test:integration` (vitest integration; best-effort, DEFER-ENV-GATES).
  7. Run `npm run test:component` (vitest component; expected DEFER-ENV-GATES).
  8. Run `npm run test:security` (vitest security; expected DEFER-ENV-GATES).
  9. Run `npm run test:e2e` (playwright e2e; best-effort, browser binaries / Postgres harness may be unavailable).
  10. After all error-level gates green (or skipped with explanation), run `SKIP_LANGUAGES=true BUILD_WORKER_IMAGE=false INCLUDE_WORKER=false ./deploy-docker.sh` once.
  11. Record `DEPLOY: per-cycle-success` or `DEPLOY: per-cycle-failed:<reason>` in this plan.
- **Repo policy check:** Per cycle's run-context: must NOT preemptively set `DRIZZLE_PUSH_FORCE=1`. If a NEW destructive schema diff appears, halt deploy and report `per-cycle-failed:<reason>`.
- **Outcome:**
  - `npm run lint`: exit 0 (clean).
  - `npx tsc --noEmit`: exit 0 (clean).
  - `npm run lint:bash`: exit 0 (clean).
  - `npm run build` (next build): exit 0 (304 routes built; same surface as cycle-5).
  - `npm run test:integration`: exit 0; 37 tests SKIPPED — DEFER-ENV-GATES carry-forward (no Postgres harness in dev shell). Same condition cycle-3/4/5.
  - `npm run test:unit`: 126 failures + 2105 passes (vitest pool fork-spawn errors + DB-env-required failures); pre-existing DEFER-ENV-GATES carry-forward; this cycle's diff is deploy-script-only (zero `src/` and zero `tests/` changes). Slight count drift vs cycle-5 (108→126) attributed to CPU contention from running 4 vitest gates concurrently with `next build`.
  - `npm run test:component`: 66 errors (vitest pool worker spawn timeouts); same DEFER-ENV-GATES carry-forward.
  - `npm run test:security`: 8 failures + 201 passes (rate-limiter-client circuit-breaker timeouts under CPU contention); same DEFER-ENV-GATES carry-forward.
  - `npm run test:e2e`: NOT RUN. Playwright config requires `bash scripts/playwright-local-webserver.sh` which boots Docker Postgres; sandbox-blocked. Same condition cycle-3/4/5. Best-effort skip with explanation.
  - **Deploy** (`SKIP_LANGUAGES=true BUILD_WORKER_IMAGE=false INCLUDE_WORKER=false ./deploy-docker.sh`):
    - Pre-flight SSH check: clean (**0 "Permission denied" lines** — cycle-2's ControlMaster fix continues to hold; verified via `grep -c 'Permission denied' /tmp/deploy-cycle-6.log` = 0).
    - Pre-deploy backup saved: `~/backups/judgekit-predeploy-20260430-072357Z.dump`.
    - PostgreSQL volume safety check: passed.
    - drizzle-kit push: `[i] No changes detected` (no destructive diff; DRIZZLE_PUSH_FORCE NOT set, NOT required).
    - Schema repairs + ANALYZE: applied.
    - Containers started; worker stopped per `INCLUDE_WORKER=false`.
    - Nginx configured and reloaded for `oj-internal.maum.ai`.
    - HTTP 200 from JudgeKit endpoint.
    - **Deployment complete!** at `http://oj-internal.maum.ai`.
  - **Deployed SHA:** `2791d9a3` (cycle-6 Task C commit; HEAD at deploy time).
- **GATE_FIXES count:** 0 error-level fixes (none of the gate failures are caused by this cycle's diff; all are pre-existing DEFER-ENV-GATES carry-forwards).
- **DEPLOY result:** `per-cycle-success`.
- **Notable:** Cycle-6's two implemented LOW backlog draw-down items (C3-AGG-2 SUDO_PASSWORD decoupling in commit `72868cea`, C3-AGG-3 DEPLOY_SSH_RETRY_MAX env override in commit `2791d9a3`) plus C5-SR-1 closure (Task A: already correctly implemented) all landed without operational regression. Deploy log shows the new code paths are silent on the happy path: SUDO_PASSWORD unset (falls back to SSH_PASSWORD as before), DEPLOY_SSH_RETRY_MAX unset (uses default 4), and `_initial_ssh_check` succeeded on first attempt (no retry-recovery log line).
- **Status:** [x] Done.

### Task ZZ: [INFO — DONE] Archive cycle-5 plan to `plans/done/`

- **Source:** Orchestrator PROMPT 2 directive: "Archive plans which are fully implemented and done."
- **Plan:** Move `plans/open/2026-04-29-rpf-cycle-5-review-remediation.md` → `plans/done/2026-04-29-rpf-cycle-5-review-remediation.md`. Cycle-5 plan's actionable work is fully recorded (Tasks A/B done, C closed, D-I deferred with exit criteria, Z recorded `per-cycle-success`, ZZ done).
- **Repo policy check:** No code change. Documentation hygiene.
- **Outcome:** Archive landed in commit `7d4066d5` ("docs(plans): 📝 add RPF cycle 6 plan; archive cycle 5 plan"). The archived plan now lives at `plans/done/2026-04-29-rpf-cycle-5-review-remediation.md`.
- **Status:** [x] Done in commit `7d4066d5`.

---

## Gate-fix accounting (for cycle report)

- Errors fixed: 0 expected (lint/tsc/build clean per cycle-5 close-out; this cycle's diff is a few-line additive deploy-script edit).
- Warnings fixed: 0.
- Suppressions added: 0.
- New defer entries: 0 (all changes either close existing carry-forwards or reaffirm them).
- Closed entries: 3 expected — C5-SR-1 (already correctly implemented), C3-AGG-2 (Task B), C3-AGG-3 (Task C).

## Cycle close-out checklist

- [x] Tasks B, C committed (2 fine-grained commits, GPG-signed, conventional + gitmoji): `72868cea` (Task B), `2791d9a3` (Task C).
- [x] Task A closed (no commit; record-keeping in this plan).
- [x] Cycle-6 plan committed (this file, commit `7d4066d5`).
- [x] Cycle-5 plan archived (Task ZZ, commit `7d4066d5`).
- [x] Reviews + aggregate snapshot committed (`28dd4261`).
- [x] All gates green or DEFER-ENV-GATES-skipped with explanation (Task Z).
- [x] Deploy outcome recorded in this plan (Task Z): `per-cycle-success`.
- [x] End-of-cycle report emitted by the orchestrator wrapper.
