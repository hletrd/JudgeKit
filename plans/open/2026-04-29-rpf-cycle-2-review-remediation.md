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

### Task A: [MEDIUM — IN PROGRESS] Chmod 0600 the auto-generated `.env.production` in `deploy-docker.sh`

- **Source:** C2-AGG-1 (security-reviewer C2-SR-1).
- **Severity:** MEDIUM (security, defense-in-depth).
- **Files:** `deploy-docker.sh` line 211-223 (the `cat > "${SCRIPT_DIR}/.env.production" <<EOF` heredoc).
- **Concrete failure scenario:** Operator deploys from a shared host. Default umask 0022 yields 0644 on the new file; any local user can read AUTH_SECRET, JUDGE_AUTH_TOKEN, PLUGIN_CONFIG_ENCRYPTION_KEY.
- **Repo policy quote (CLAUDE.md, "Destructive Action Safety (CRITICAL)"):** *"Secrets & Credentials: ... writing secrets to unencrypted files or logs"* — disallows lax handling of secrets to local files. NOT deferrable.
- **Fix:** Add `chmod 0600 "${SCRIPT_DIR}/.env.production"` immediately after the heredoc closes.
- **Exit criterion:** `stat -f '%A' .env.production` (macOS) / `stat -c '%a' .env.production` (Linux) returns `600` after a fresh generation.
- [ ] To do this cycle.

### Task B: [LOW — DEFERRED] sshpass auth pattern fragility in `deploy-docker.sh`

- **Source:** C2-AGG-2 (code-reviewer C2-CR-1, security-reviewer C2-SR-2). Cross-agent agreement: 2.
- **Severity (preserved):** LOW.
- **Files:** `deploy-docker.sh` lines 140-174 (the four helpers `remote`, `remote_copy`, `remote_rsync`, `remote_sudo`).
- **Concrete failure scenario:** ANALYZE step's `remote_sudo` pipe is consumed by sshpass before sudo can prompt → "Permission denied" warning. Permissive wrapper masks the failure but pollutes deploy auditability. This is the cycle-1 observation of "transient Permission denied at backup step + non-fatal Permission denied at ANALYZE step" on `platform@10.50.1.116`.
- **Reason for deferral:** This is operational, not a runtime app vulnerability. Fixing it requires switching to `ssh -o ControlMaster=auto -o ControlPersist=60` connection multiplexing AND decoupling SSH/sudo passwords (introduce `SSH_SUDO_PASSWORD` env var). Both changes carry deploy-script regression risk that is bigger than the bug they fix; the right time to land them is alongside a deploy-hardening cycle that adds a `tests/deploy/*.sh` smoke test (see Task D).
- **Repo policy check:** Per the deferred-fix rules in PROMPT 2 ("Security, correctness, and data-loss findings are NOT deferrable unless the repo's own rules explicitly allow it"). This is NOT security/correctness/data-loss for the application surface — it's a deploy-script-only operational nicety. Severity preserved at LOW; deferral is permitted.
- **Exit criterion:** Either (a) a deploy-hardening cycle is opened (Task D below), or (b) a third sshpass-related deploy failure occurs in a subsequent cycle (concrete repeat-rate trigger).
- [x] Deferred this cycle. Documented with file+line, severity preserved, concrete reason, exit criterion.

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

### Task Z: [INFO — IN PROGRESS] Run all configured gates and the deploy

- **Source:** Orchestrator GATES + DEPLOY_MODE.
- **Plan:**
  1. Run `npm run lint`, `npx tsc --noEmit`, `npm run build` — should be clean (cycle 1 left them green).
  2. Run `npm run test:unit`, `npm run test:integration`, `npm run test:component`, `npm run test:security` best-effort — record pre-existing env failures as DEFERRED with the cycle-1 Task H exit criterion.
  3. Run `npm run test:e2e` best-effort — record env failure as DEFERRED with the cycle-1 Task E exit criterion.
  4. Run `SKIP_LANGUAGES=true BUILD_WORKER_IMAGE=false INCLUDE_WORKER=false ./deploy-docker.sh` exactly once. Do NOT preemptively set `DRIZZLE_PUSH_FORCE=1`. If a NEW destructive schema diff appears, halt and record `DEPLOY: per-cycle-failed:<reason>` for orchestrator escalation.
- [ ] To do this cycle.

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
