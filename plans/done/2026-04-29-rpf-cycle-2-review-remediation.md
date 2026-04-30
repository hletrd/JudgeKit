# RPF Cycle 2 Review Remediation Plan (orchestrator-driven, 2026-04-29)

**Date:** 2026-04-29
**Source:** `.context/reviews/_aggregate.md` (RPF cycle 2 orchestrator-driven) + `plans/user-injected/pending-next-cycle.md`
**Status:** IN PROGRESS

---

## Cycle prologue

- HEAD at start of cycle: `c449405d`.
- Cycle 1 closed: workspace→public migration archived; eslint/gitignore noise eliminated; deploy-script SKIP_* honoring fixed; deploy halted at a destructive-schema diff awaiting user authorization.
- User-injected TODO #1 is CLOSED per `plans/user-injected/pending-next-cycle.md`. Re-read at cycle start; no new entries.
- Pre-cycle gates: `npm run lint` exit 0 (no warnings, no errors), `npx tsc --noEmit` exit 0.
- Cycle-2 reviewer fan-out wrote 11 files; the original `rpf-cycle-2-aggregate.md` was based on stale HEAD `fab30962`. Most of its findings are already RESOLVED at HEAD `c449405d` (verified by inspection — see `_aggregate.md` "Resolved at current HEAD" section). The canonical aggregate at `_aggregate.md` carries forward only findings still applicable.

## Tasks

### Task A: [MEDIUM — DONE] Chmod 0600 the auto-generated `.env.production` in `deploy-docker.sh`

- **Source:** C2-AGG-1 (security-reviewer C2-SR-1).
- **Severity:** MEDIUM (security, defense-in-depth).
- **Files:** `deploy-docker.sh` line 211-243 (the `cat > "${SCRIPT_DIR}/.env.production" <<EOF` heredoc).
- **Concrete failure scenario:** Operator deploys from a shared host. Default umask 0022 yields 0644 on the new file; any local user can read AUTH_SECRET, JUDGE_AUTH_TOKEN, PLUGIN_CONFIG_ENCRYPTION_KEY.
- **Repo policy quote (CLAUDE.md, "Destructive Action Safety (CRITICAL)"):** *"Secrets & Credentials: ... writing secrets to unencrypted files or logs"* — disallows lax handling of secrets to local files. NOT deferrable.
- **Fix applied (commit ab31a40f):** Added `chmod 0600 "${SCRIPT_DIR}/.env.production"` after the heredoc closes (fresh-generation path) AND opportunistically chmod 0600 on the existing-file path (idempotent for already-secured files). Verified `bash -n deploy-docker.sh` passes.
- **Exit criterion (verified):** Lint/tsc/build still green at HEAD post-commit.
- [x] Done (commit ab31a40f).

### Task B: [LOW → ESCALATING] sshpass auth pattern fragility in `deploy-docker.sh` — EXIT CRITERION MET

- **Source:** C2-AGG-2 (code-reviewer C2-CR-1, security-reviewer C2-SR-2). Cross-agent agreement: 2.
- **Severity (preserved):** LOW (still operational, not application-vuln); but exit criterion has been MET this cycle.
- **Files:** `deploy-docker.sh` lines 140-174 (the four helpers `remote`, `remote_copy`, `remote_rsync`, `remote_sudo`).
- **Concrete failure scenario observed THIS CYCLE:**
  - Cycle 2 deploy attempt #1: `remote_copy /tmp/judgekit-nginx.conf "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}/nginx-judgekit.conf"` — sshpass-fed scp prompted twice with "Permission denied, please try again." then `platform@10.50.1.116: Permission denied (publickey,password). scp: Connection closed`.
  - Cycle 2 deploy attempt #2 (recovery): pre-flight `remote "echo ok"` OK; immediately-following `remote "docker info"` → `Permission denied` (auth lockout from prior run's repeated auth failures).
- **Status update:** Exit criterion was: *"a third sshpass-related deploy failure occurs in a subsequent cycle"*. Cycle 1 had the first occurrence (warned, deploy completed). Cycle 2 has now had two more (one fatal, one recovery-blocking). **Exit criterion MET.**
- **Next-cycle action:** PROMPT 2 of cycle 3 must pull this task forward as IN-PROGRESS rather than DEFERRED. The fix should:
  1. Switch to `ssh -o ControlMaster=auto -o ControlPersist=60 -o ServerAliveInterval=15` (connection multiplexing — amortize the auth handshake).
  2. Decouple SSH and sudo passwords: introduce `SSH_SUDO_PASSWORD` env var; fall back to `SSH_PASSWORD` only when unset.
  3. Add a sleep-with-jitter retry (3 attempts, exponential backoff) inside `remote()` / `remote_copy()` / `remote_rsync()` / `remote_sudo()` for the specific case of "Permission denied" on a previously-successful host.
- **Repo policy check:** Per the deferred-fix rules in PROMPT 2 ("Security, correctness, and data-loss findings are NOT deferrable unless the repo's own rules explicitly allow it"). This is NOT security/correctness/data-loss for the application surface — it's a deploy-script-only operational fragility. Severity preserved at LOW; deferral was permitted at the start of this cycle. The escalation now is per the cycle's own exit criterion, not a severity downgrade.
- [x] Deferred this cycle (entry-state). Exit criterion MET this cycle (deploy attempts #1 and #2 both failed at sshpass-handled steps). Roll forward to cycle 3 as IN-PROGRESS.

#### Cycle-3 closure note (2026-04-29)

**Status reclassification:** The "roll forward to cycle 3 as IN-PROGRESS" wording above is stale. The implementation actually landed within cycle 2 itself, in two commits authored AFTER this plan was written but BEFORE cycle 2 closed:

1. `21125372` — fix(deploy): 🔌 multiplex SSH connections to avoid sshpass auth flakes. Adds SSH ControlMaster + ControlPersist=60 + ServerAliveInterval=30 + ServerAliveCountMax=3 + ConnectTimeout=15. Adds `_initial_ssh_check` retry loop (4 attempts, exponential backoff 2-16s). Adds `_cleanup_ssh_master` and `EXIT` trap.
2. `66146861` — fix(deploy): 🐛 use /tmp directly for SSH ControlPath socket dir. Reason: macOS `$TMPDIR` is `/var/folders/.../T/` which combined with the 40-char `%C` hash exceeds the 104-byte UNIX socket path limit. Hardcoding `/tmp/judgekit-ssh.XXXXXX` gives a 68-byte path well under the limit.

**Verification:** Cycle-3 deploy log shows 0 "Permission denied" lines (per orchestrator history). Cycle-3 verifier reviewer (`.context/reviews/rpf-cycle-3-verifier.md`) confirms each commit-message claim against current HEAD `66146861`.

**Splitting:** The original C2-AGG-2 finding is reclassified as two sub-findings:
- **C2-AGG-2A** (sshpass deploy-blocker — Permission denied at nginx step): **DONE** in cycle-2 commits `21125372` + `66146861`. No further action.
- **C2-AGG-2B** (SSH/sudo password decoupling — `remote_sudo` assumes SSH password = sudo password): **DEFERRED** as `C3-AGG-2` in `plans/open/2026-04-29-rpf-cycle-3-review-remediation.md` Task B. Exit criterion: SSH password rotation without sudo password rotation on any deploy target, OR a docker host with separate SSH/sudo credentials is added.

This closure note resolves cycle-3 finding **C3-AGG-1** (process / docs hygiene — cycle-2 plan stale status).

### Task C: [LOW — DEFERRED] Drizzle destructive-schema-change policy not codified in repo rules

- **Source:** C2-AGG-3 (critic C2-CT-2).
- **Severity (preserved):** LOW.
- **Files:** N/A (would add a section to `AGENTS.md` or `CLAUDE.md`).
- **Concrete failure scenario:** Future cycles re-derive the policy from CLAUDE.md's general destructive-action rule and possibly diverge from cycle-1's chosen approach (refuse to auto-force, escalate to user).
- **Reason for deferral:** Pure documentation; no runtime impact; should land alongside the next cycle that touches `AGENTS.md` for any reason.
- **Repo policy check:** Not security/correctness/data-loss. Severity LOW. Deferral permitted.
- **Exit criterion:** Next cycle that touches `AGENTS.md` adds a 5-line section: (a) the prompt pattern, (b) the policy ("never auto-force; escalate"), (c) `DRIZZLE_PUSH_FORCE=1` is reserved for explicit user authorization with quoted-text consent.
- [x] Deferred this cycle.

### Task D: [LOW — DEFERRED] No regression-guard for `deploy-docker.sh` SKIP_*/LANGUAGE_FILTER honor

- **Source:** C2-AGG-4 (critic C2-CT-1).
- **Severity (preserved):** LOW.
- **Files:** `deploy-docker.sh` lines 79-110 (the SKIP_*/LANGUAGE_FILTER block fixed in cycle 1's commit `bdfc79e1`).
- **Concrete failure scenario:** Future edits silently re-introduce `SKIP_LANGUAGES=false` unconditionally and fail on the next deploy.
- **Reason for deferral:** Adding a deploy smoke test is non-trivial (needs a `--dry-run` flag in the script first, or a fixture-based bash unit test) — bigger than the bug it prevents. Should land in a deploy-hardening cycle.
- **Repo policy check:** Not security/correctness/data-loss. LOW severity. Deferral permitted.
- **Exit criterion:** A `tests/deploy/skip-languages-honor.sh` smoke test is added, OR the SKIP_* logic regresses again (concrete repeat-rate trigger).
- [x] Deferred this cycle.

### Task E: [LOW — DEFERRED, carry-forward] Visibility-aware polling pattern duplicated across 4-6 components

- **Source:** C2-AGG-5 (architect carry-forward; cycle-28 DEFER-21).
- **Severity (preserved):** LOW.
- **Files:** `src/components/submission-list-auto-refresh.tsx`, `src/components/submissions/submission-detail-client.tsx`, `src/components/layout/active-timed-assignment-sidebar-panel.tsx`, `src/components/exam/countdown-timer.tsx`, plus 2-3 more under `src/components/contest/`.
- **Concrete failure scenario:** Drift between implementations — one forgets a `removeEventListener` and leaks event handlers, another forgets to resync state on visibility return.
- **Reason for deferral:** Refactor risk vs. benefit; needs a unified API surface (`useVisibilityAwarePolling(fetchFn, intervalMs)` hook) that does not regress the four already-correct call sites.
- **Repo policy check:** Not security/correctness/data-loss. LOW severity. Deferral permitted.
- **Exit criterion:** Telemetry signal (real-user CPU usage when multiple background tabs are open), OR a 7th duplicated implementation is added, OR a regression is found in any of the existing call sites.
- [x] Deferred this cycle (was already deferred prior; status preserved).

### Task F: [LOW — DEFERRED, carry-forward] Practice page Path B fetches all matching IDs + submissions in memory

- **Source:** C2-AGG-6 (perf-reviewer carry-forward; cycle-2 PERF-2 / cycle-18 AGG-3).
- **Severity (preserved):** LOW.
- **Files:** `src/app/(public)/practice/page.tsx:417` (and the block that follows).
- **Concrete failure scenario:** When practice problems exceed 5k matching IDs for an active progress filter, the in-memory filter consumes excessive memory and increases p99 latency.
- **Reason for deferral:** Refactoring to a SQL CTE / subquery is a sizeable change with cross-cutting query-plan implications. Should land in a perf-focused cycle with EXPLAIN ANALYZE evidence.
- **Repo policy check:** Not security/correctness/data-loss. LOW severity. Deferral permitted.
- **Exit criterion:** Practice page p99 latency > 1.5s OR > 5k matching problems for any active query, OR a user-reported "page is slow with progress filter".
- [x] Deferred this cycle (was already deferred prior; status preserved).

### Task G: [LOW — DEFERRED, carry-forward] `recruiting-invitations-panel.tsx` builds invitation URL from `window.location.origin`

- **Source:** C2-AGG-7 (security-reviewer carry-forward; cycle-2 SEC-1).
- **Severity (preserved):** LOW.
- **Files:** `src/components/contest/recruiting-invitations-panel.tsx:99` (also lines 181, 207 per cycle-2 review).
- **Concrete failure scenario:** Behind a misconfigured proxy, `window.location.origin` returns a non-canonical host; invitation links contain the wrong host.
- **Reason for deferral:** No current exposure (the canonical algo.xylolabs.com app server proxies through nginx with a single canonical host). Defense-in-depth.
- **Repo policy check:** Not security/correctness/data-loss in the present deployment. LOW severity. Deferral permitted.
- **Exit criterion:** A user reports an invitation link with a wrong host, OR a server-side `appUrl` config value is added for unrelated reasons.
- [x] Deferred this cycle (was already deferred prior; status preserved).

### Task Z: [INFO — DONE] Run all configured gates and the deploy

- **Source:** Orchestrator GATES + DEPLOY_MODE.
- **Result:**
  1. `npm run lint` exit 0 (clean).
  2. `npx tsc --noEmit` exit 0 (clean).
  3. `npm run build` exit 0 (clean).
  4. `npm run test:unit` / `test:integration` / `test:component` / `test:security`: ALL pre-existing env failures (vitest forks-pool worker spawn timeouts; "no tests" / "Errors". Cycle 1's Task H confirmed identical failures on cycle-11 baseline, proving these are environmental). DEFERRED per cycle-1 Task H exit criterion: "fully provisioned CI/host with DATABASE_URL, reachable Postgres, rate-limiter sidecar, Playwright browsers". My cycle-2 changes (deploy-docker.sh chmod-0600 + plan/review docs) cannot affect any test runtime — zero source code in `src/` was touched.
  5. `npm run test:e2e`: webServer exited with code 1 (DATABASE_URL not set in dev shell). DEFERRED per cycle-1 Task E exit criterion.
  6. Deploy attempt #1 (`SKIP_LANGUAGES=true BUILD_WORKER_IMAGE=false INCLUDE_WORKER=false ./deploy-docker.sh`):
     - Pre-flight, source rsync, app image build, postgres start, app container start: ALL OK.
     - drizzle-kit push: "No changes detected" — cycle 1's destructive-schema diff is RESOLVED at this HEAD (no manual approval required, no `DRIZZLE_PUSH_FORCE=1` needed). This is a positive signal that cycle 1's manual-authorization-block is no longer the gating issue.
     - ANALYZE: OK.
     - All containers started: OK.
     - **FAILED at "Configuring nginx reverse proxy for oj-internal.maum.ai" step** (line 909 `remote_copy` invoking `scp` via `sshpass`): `platform@10.50.1.116: Permission denied (publickey,password)`. This is the **exact reproduction** of the cycle-1 orchestrator-flagged sshpass observation; it's the C2-AGG-2 / Task B finding manifesting in production.
  7. Deploy attempt #2 (one recovery attempt, per orchestrator policy "attempt one reasonable recovery — e.g. re-run idempotent commands"):
     - Pre-flight first SSH probe (`remote "echo ok"`): OK.
     - Pre-flight second SSH probe (`remote "docker info"`): `Permission denied` — auth lockout from the previous run's repeated auth failures.
     - Aborted at pre-flight check. **`docker is not available on the remote host`** error printed.
- **GATE_FIXES:** 0 error-level fixes (no error-level gate issues caused by this cycle's changes; bash syntax validated for the deploy-docker.sh edit). Pre-cycle env failures preserved (deferred under Task H continuation).
- **DEPLOY result:** `per-cycle-failed:sshpass-auth-flaky-at-nginx-step-c2-agg-2-reproduced-recovery-blocked-on-auth-lockout`.
- **C2-AGG-2 / Task B exit criterion is now MET** (the deferred-fix exit criterion was: "a third sshpass-related deploy failure occurs in a subsequent cycle"). Cycle 1 hit the same pattern transiently (warned but completed); this cycle (cycle 2) hit it twice in a row and could not deploy past nginx config. The next cycle's PROMPT 2 should pull Task B forward as IN-PROGRESS rather than DEFERRED.
- [x] Done.

## User-injected TODO check (re-read at cycle start)

`plans/user-injected/pending-next-cycle.md` shows:
- **TODO #1 — workspace→public migration:** CLOSED 2026-04-29 (cycle 1 RPF). No new entries.
- No new TODOs queued. PROMPT 2 ingests review aggregate only.

## Cycle-1 deploy observation (sshpass on platform@10.50.1.116)

The orchestrator surfaced cycle 1's "flaky sshpass auth pattern at platform@10.50.1.116" with the directive: "Worth a real review pass — surface it if it reproduces in this cycle's deploy."

This cycle:
1. Re-reviewed `deploy-docker.sh:140-174` from code-reviewer + security-reviewer angles. Findings recorded as **C2-AGG-2** in the aggregate and **Task B** in this plan (LOW severity, DEFERRED with concrete exit criterion).
2. The deploy will run again this cycle (Task Z step 4). If the "Permission denied" reproduces, the cycle report records it under `DEPLOY: per-cycle-failed:<reason>` and the deferral exit criterion auto-trips ("a third sshpass-related deploy failure → land the fix").
3. The fix is NOT auto-applied this cycle because (a) it's LOW severity, (b) the fix carries deploy-script regression risk that is bigger than the bug, and (c) cycle-1 also did not auto-apply destructive remediations (refused `DRIZZLE_PUSH_FORCE=1`). Deferring follows the established pattern.

## Summary

- 1 task to implement this cycle: Task A (.env.production chmod 0600).
- 6 tasks deferred with file+line, severity preserved, concrete reasons, and exit criteria.
- 0 user-injected TODOs to address (TODO #1 closed in cycle 1).
- Deploy + gate run is the third in-cycle step.
