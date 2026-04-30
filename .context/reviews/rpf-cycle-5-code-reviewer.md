# Code Reviewer — RPF Cycle 5 (orchestrator-driven, 2026-04-29)

**Date:** 2026-04-29
**HEAD reviewed:** `2626aab6` (cycle-4 close-out: docs(plans) mark cycle 4 Task Z (gates+deploy) and Task ZZ (archive) done).
**Cycle change surface vs cycle-4 close-out commit `2626aab6`:** EMPTY. Cycle-4 close-out is HEAD; we are re-reviewing the same HEAD as cycle-4. (Note: an earlier non-orchestrator cycle-5 run produced reviews against base commit `4c2769b2`; those findings (group-export OOM cap, PublicHeader dropdown role-filter, etc.) all subsequently RESOLVED at HEAD by intervening commits. Confirmed by direct file inspection: `MAX_EXPORT_ROWS = 10_000` present in `groups/[id]/assignments/[assignmentId]/export/route.ts:14`; PublicHeader no longer carries `adminOnly`/`instructorOnly` dead flags.)

## Inventory

- `src/` tree: unchanged since cycle 3 (last touched by cycle-3 docs commits).
- `deploy-docker.sh`: 1032 lines (cycle-4 added 31 lines via Task A header docstring + Task B chmod-700 comment + Task C succeeded-after-N-attempts log line).
- `deploy.sh`: 289 lines (legacy entrypoint, unchanged since cycle-2 critique).
- `AGENTS.md`: 565 lines (cycle-4 added "Deploy hardening" subsection per Task A).

## NEW findings this cycle

**None.** The change surface is empty. All cycle-4 fixes (Tasks A/B/C) verified at HEAD `2626aab6`:

1. **Task A artifacts present:** `deploy-docker.sh:1-30` header docstring enumerates 8 env vars (`SKIP_LANGUAGES`, `SKIP_BUILD`, `BUILD_WORKER_IMAGE`, `INCLUDE_WORKER`, `LANGUAGE_FILTER`, `SKIP_PREDEPLOY_BACKUP`, `AUTH_URL_OVERRIDE`, `DRIZZLE_PUSH_FORCE`). `AGENTS.md` "Deploy hardening" subsection enumerates each cycle-1/2/3/4 fix.
2. **Task B artifact present:** `deploy-docker.sh:151-152` `# defense-in-depth — mktemp -d already creates 0700, this guards against unset umask` comment.
3. **Task C artifact present:** `_initial_ssh_check` emits `info "SSH connection succeeded after ${attempt} attempts"` only when `attempt > 1`.

## Resolutions of prior cycle-5 (stale base) findings, verified at HEAD

The earlier (now-stale) cycle-5 review run was rooted at `4c2769b2`. Re-checked at current HEAD; all of its actionable findings either RESOLVED or DEFERRED:

- AGG-1 (PublicHeader dropdown role filter): RESOLVED. Component refactored — `adminOnly`/`instructorOnly` dead flags no longer present in `src/components/layout/public-header.tsx`.
- AGG-2 (Group assignment export OOM): RESOLVED. `MAX_EXPORT_ROWS = 10_000` cap at `src/app/api/v1/groups/[id]/assignments/[assignmentId]/export/route.ts:14`.
- AGG-5 (Dual count + data queries on multiple routes): subsumed by **ARCH-CARRY-1** (22+ raw API route handlers) carry-forward, still DEFERRED with exit criterion (API-handler refactor cycle).
- AGG-6 (Manual `getApiUser` routes): same as **ARCH-CARRY-1** — DEFERRED.
- AGG-7 (Missing tests for export/dropdown/leaderboard): subsumed by **DEFER-ENV-GATES** (env-blocked test gates) plus follow-up test cycle. DEFERRED.

## Carry-forward LOW backlog (severity preserved, no downgrade)

- **C3-AGG-2** (LOW) `deploy-docker.sh:204-214` — `remote_sudo` SSH/sudo password decoupling.
- **C3-AGG-3** (LOW) `deploy-docker.sh:165-178` — retry-count env-var override + ControlMaster keepalive auto-reconnect.
- **C3-AGG-4** (LOW) `package.json` / CI surface — `bash -n` + `shellcheck` CI gate.
- **C3-AGG-5** (LOW) `deploy-docker.sh` whole + `deploy.sh:58-66` — modular extraction + legacy `deploy.sh` cleanup.
- **C3-AGG-6** (LOW) `deploy-docker.sh:151` — ControlMaster socket dir path-predictability.
- **C3-AGG-8** (LOW) `deploy-docker.sh:129-133` — deploy-instance log prefix.
- **C2-AGG-5/6/7**, **C1-AGG-3**, **DEFER-ENV-GATES**, **D1**, **D2**, **AGG-2** (Date.now), **ARCH-CARRY-1**, **ARCH-CARRY-2**, **PERF-3** — all unchanged.

## Recommendation for this cycle

Pick at least 2-3 LOW deferred items to draw down the backlog. Top candidates by minimum-risk × max-benefit:

1. **C3-AGG-8** (deploy-instance log prefix) — Pure-additive shell-helper update; behavior unchanged when env var unset. ~10-line edit in `deploy-docker.sh:129-133`. Naturally meets exit criterion ("real-world incident" is not the only path; explicit operator-supplied `DEPLOY_INSTANCE` env var is sufficient even pre-incident).
2. **C3-AGG-4** (bash lint script) — Add `lint:bash` npm script invoking `bash -n deploy-docker.sh deploy.sh`. Ships the script regardless of CI hosting; CI hosting is the next-step exit criterion. Local invocation works in any dev shell.
3. **C2-AGG-7** (recruiting hardcoded appUrl) — Single-file fallback to `process.env.NEXT_PUBLIC_APP_URL` with the existing literal as default. Behavior preserved when env var unset.

These three drawdowns retire 3 LOW backlog items in one cycle without functional regressions.

## Confidence

**High.** Direct file inspection at HEAD `2626aab6`.
