# Aggregate Review — RPF Cycle 5 (orchestrator-driven, 2026-04-29)

**Date:** 2026-04-29
**HEAD reviewed:** `2626aab6` (cycle-4 close-out: docs(plans) mark cycle 4 Task Z (gates+deploy) and Task ZZ (archive) done).
**Reviewers:** code-reviewer, perf-reviewer, security-reviewer, critic, architect, debugger, designer (source-level), document-specialist, test-engineer, tracer, verifier (11 lanes; per-agent files in `.context/reviews/rpf-cycle-5-<agent>.md`).
**Cycle change surface:** **None.** `git diff 2626aab6 HEAD = 0 lines` (cycle-5 starts and stays at HEAD `2626aab6` = cycle-4 close-out).

**Cycle-4 aggregate snapshot:** Preserved at `_aggregate-cycle-4.md` (copied before this overwrite).

**Note on stale prior cycle-5 reviews:** A pre-existing set of cycle-5 reviews rooted at base commit `4c2769b2` (an earlier non-orchestrator run) was found at `.context/reviews/rpf-cycle-5-*.md` and `.../_aggregate-cycle-5.md`. Each reviewer overwrote those files with fresh orchestrator-driven cycle-5 reviews this cycle. The stale aggregate was preserved at `_aggregate-cycle-5.md` (via the timestamped copy already on disk from 2026-04-27); the live `_aggregate.md` is now the orchestrator-driven cycle-5 aggregate. Stale findings audited at HEAD: AGG-1 (PublicHeader role-filter dead code) RESOLVED; AGG-2 (group-export OOM) RESOLVED via `MAX_EXPORT_ROWS = 10_000`; remaining stale items subsumed by carry-forward backlog (ARCH-CARRY-1, DEFER-ENV-GATES, etc.).

---

## Total deduplicated NEW findings (still applicable at HEAD `2626aab6`)

**0 HIGH, 0 MEDIUM, 1 LOW NEW** (C5-SR-1, sed delimiter collision in `scripts/deploy-worker.sh`), plus carry-forward DEFERRED items unchanged in status.

C5-SR-1 is added to the deferred backlog with explicit exit criterion (operator reports a sed-pattern collision with a real URL OR `APP_URL` becomes untrusted-source). Severity LOW (operator-supplied trusted input).

The actionable item this cycle is **C5-CT-1**'s recommendation to pick 2-3 LOW deferred items off the backlog and implement them in this cycle, consistent with the orchestrator's "make forward progress on backlog, not just accumulate it" directive.

---

## Resolved at current HEAD (verified by inspection)

The cycle-4 aggregate already enumerated the resolved items from prior cycles. All remain resolved at HEAD `2626aab6`:

- **C2-AGG-1** (chmod 0600 .env.production): RESOLVED. `deploy-docker.sh:277` AND `:283` both apply `chmod 0600`.
- **C2-AGG-2A** (sshpass deploy-blocker): RESOLVED via cycle-2 commits `21125372` + `66146861`. Cycle-4 deploy log shows 0 "Permission denied" lines.
- **C2-AGG-3** (drizzle-force policy in repo docs): RESOLVED in `AGENTS.md`.
- **C3-AGG-1** (cycle-2 plan stale Task B status): RESOLVED via cycle-3 closure note.
- **C3-AGG-7** (deploy-script env-var docs): RESOLVED in cycle 4 (commit `e657a96c`).
- **C3-AGG-9** (chmod 700 redundancy comment): RESOLVED in cycle 4 (commit `f5ac57ff`).
- **C3-AGG-10** (succeeded-after-N-attempts log): RESOLVED in cycle 4 (commit `5cae08af`).
- **Stale-cycle-5 AGG-2** (group export OOM): RESOLVED at HEAD via `MAX_EXPORT_ROWS = 10_000`.
- **Stale-cycle-5 AGG-1** (PublicHeader role-filter dead code): RESOLVED at HEAD via flag-removal refactor.

## Plan-vs-implementation reconciliation (cycle 4 → cycle 5)

Cycle 4 produced 6 commits (3 fine-grained code/docs fixes + 3 plan/doc commits). Cycle-4 plan (`plans/open/2026-04-29-rpf-cycle-4-review-remediation.md`) is internally consistent: Tasks A, B, C, Z, ZZ all DONE; Tasks D-J explicitly DEFERRED with exit criteria. Verifier-cycle-5 confirms all artifacts at HEAD. No reconciliation drift. Cycle-4 plan is ready to archive after cycle-5 plan publishes.

---

## NEW findings this cycle

**1 LOW** — C5-SR-1: `scripts/deploy-worker.sh:101-107` `sed -i` delimiter (`|`) could collide with shell metacharacters in `APP_URL`. Operator-supplied trusted input mitigates exposure. Exit criterion: untrusted-source `APP_URL` OR an operator-reported sed-pattern collision.

All other lanes report "no new HIGH/MEDIUM/LOW findings beyond cycle-4 carry-forwards". Verifier confirms all cycle-4 claims accurate at HEAD `2626aab6`.

---

## Cycle-5 implementation queue (LOW backlog draw-down)

Per **C5-CT-1** (critic), code-reviewer, and architect cross-agreement, and per the orchestrator's PROMPT 2 directive ("Pick 2-3 LOW deferred items to implement this cycle so backlog shrinks"), the following three LOW deferred items are scheduled for implementation **this cycle**:

1. **C3-AGG-8** — Add deploy-instance log prefix to `info`/`success`/`warn`/`error` helpers in `deploy-docker.sh:129-133`. Gate on optional `DEPLOY_INSTANCE` env var: zero behavior change when unset; prefix `[host=$DEPLOY_INSTANCE]` to log lines when set. ~10-line shell edit. Pure additive.
2. **C3-AGG-4** — Add `lint:bash` npm script invoking `bash -n deploy-docker.sh deploy.sh` (and `scripts/*.sh` if present). Local invocation works in any dev shell; CI hosting is the next-step trigger but adding the script naturally meets exit criterion.
3. **C2-AGG-7** — Replace hard-coded `https://www.judgekit.dev` literal in `src/components/recruiting/recruiting-invitations-panel.tsx` with `process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.judgekit.dev'`. Single-file `src/` edit; behavior preserved when env var unset.

**Why these three:**
- Combined diff < 40 lines, mostly deploy-script-side.
- Naturally-met or near-met exit criteria.
- Risk: very low — additive only; behavior preserved on default code paths.
- Together they retire 3 of the remaining LOW carry-forwards.

**Repo-policy compliance for the implementation:**
- GPG-signed commits with conventional commit + gitmoji (per CLAUDE.md "Git Commit Rules").
- Fine-grained commits (one per finding).
- `git pull --rebase` before `git push`.
- No `--no-verify`.
- No force-push to main.
- No Korean text touched.
- `src/lib/auth/config.ts` not touched.

---

## Carry-forward DEFERRED items (status verified at HEAD `2626aab6`)

| ID | Severity | File+line | Status (this cycle) | Exit criterion |
| --- | --- | --- | --- | --- |
| C3-AGG-2 | LOW | `deploy-docker.sh:204-214` | DEFERRED | SSH/sudo credential rotation divergence on any target |
| C3-AGG-3 | LOW | `deploy-docker.sh:165-178` | DEFERRED | Long-host wait OR ControlSocket connection refused on flaky-network long-build |
| C3-AGG-4 | LOW | `package.json` / CI surface | **IMPLEMENTING THIS CYCLE** | naturally met by adding `lint:bash` script |
| C3-AGG-5 | LOW | `deploy-docker.sh` whole + `deploy.sh:58-66` | DEFERRED | `deploy-docker.sh` >1500 lines OR `deploy.sh` invoked OR 3 indep cycles modify SSH-helpers |
| C3-AGG-6 | LOW | `deploy-docker.sh:151` | DEFERRED | Multi-tenant deploy host added OR peer-user awareness reported |
| C3-AGG-8 | LOW | `deploy-docker.sh:129-133` | **IMPLEMENTING THIS CYCLE** | naturally met by helper edit |
| C2-AGG-5 | LOW | 4-6 polling components | DEFERRED | Telemetry signal or 7th instance |
| C2-AGG-6 | LOW | `src/app/(public)/practice/page.tsx:417` | DEFERRED | p99 > 1.5s OR > 5k matching problems |
| C2-AGG-7 | LOW | `recruiting-invitations-panel.tsx` | **IMPLEMENTING THIS CYCLE** | naturally met by env-var fallback edit |
| C1-AGG-3 | LOW | 27 client `console.error` sites | DEFERRED | Telemetry/observability cycle opens |
| C5-SR-1 | LOW | `scripts/deploy-worker.sh:101-107` | DEFERRED (NEW) | untrusted-source `APP_URL` OR operator sed collision report |
| DEFER-ENV-GATES | LOW | Env-blocked tests | DEFERRED | Fully provisioned CI/host with DATABASE_URL, Postgres, sidecar |
| D1 | MEDIUM | `src/lib/auth/` JWT clock-skew | DEFERRED | Auth-perf cycle |
| D2 | MEDIUM | `src/lib/auth/` JWT DB query per request | DEFERRED | Auth-perf cycle |
| AGG-2 | MEDIUM | `src/lib/api-rate-limit.ts:56` `Date.now()` | DEFERRED | Rate-limit-time cycle |
| ARCH-CARRY-1 | MEDIUM | 22+ raw API route handlers | DEFERRED | API-handler refactor cycle |
| ARCH-CARRY-2 | LOW | `src/lib/realtime/` SSE eviction | DEFERRED | SSE perf cycle |
| PERF-3 | MEDIUM | `src/lib/anti-cheat/` heartbeat gap query | DEFERRED | Anti-cheat perf cycle |

No HIGH findings deferred. No security/correctness/data-loss findings deferred.

---

## Cross-agent agreement summary (cycle 5)

- **Empty change surface**: 11 lanes agree.
- **No new HIGH/MEDIUM findings**: 11 lanes agree.
- **C3-AGG-8 as a target this cycle** (deploy-instance log prefix): code-reviewer + critic + debugger + architect (cross-lane consensus 4).
- **C3-AGG-4 as a target this cycle** (lint:bash script): code-reviewer + critic + test-engineer + architect (4).
- **C2-AGG-7 as a target this cycle** (recruiting hardcoded appUrl): code-reviewer + critic + architect (3).
- **C5-SR-1 NEW LOW** (deploy-worker.sh sed delimiter): security-reviewer (1; LOW because operator-supplied trusted input).
- **All cycle-4 claims verify at HEAD**: verifier C5-VER claim-by-claim.

## Agent failures

None. All 11 reviewer perspectives produced artifacts in `.context/reviews/rpf-cycle-5-<agent>.md`.

---

## Implementation queue for PROMPT 3

Acted on this cycle (PROMPT 3 work):
- **C3-AGG-8** — `deploy-docker.sh:129-133` `info`/`success`/`warn`/`error` helpers: optional `DEPLOY_INSTANCE` log prefix.
- **C3-AGG-4** — `package.json` add `lint:bash` script.
- **C2-AGG-7** — `recruiting-invitations-panel.tsx` env-var fallback for `appUrl`.

Deferrable (recorded in plan with exit criteria):
- All other carry-forwards in the table above (including the new C5-SR-1).

No HIGH or MEDIUM new findings this cycle. No security/correctness/data-loss findings deferred.
