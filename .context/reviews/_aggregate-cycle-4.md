# Aggregate Review — RPF Cycle 4 (orchestrator-driven, 2026-04-29)

**Date:** 2026-04-29
**HEAD reviewed:** `e61f8a91` (cycle-3 close-out: docs(plans) record cycle 3 deploy outcome — per-cycle-success).
**Reviewers:** code-reviewer, perf-reviewer, security-reviewer, critic, architect, debugger, designer (source-level), document-specialist, test-engineer, tracer, verifier (11 lanes; per-agent files in `.context/reviews/rpf-cycle-4-<agent>.md`).
**Cycle change surface:** **None.** The cycle-3 commits (`8d36398e`, `fd5197fe`, `e61f8a91`) were all `docs(plans)` / `docs(reviews)`. Zero `src/` and zero `deploy-docker.sh` / `deploy.sh` changes. The `git diff 66146861..e61f8a91 -- src/ deploy-docker.sh deploy.sh` is empty.

**Cycle-3 aggregate snapshot:** Preserved at `_aggregate-cycle-3.md` (copied before this overwrite).

---

## Total deduplicated NEW findings (still applicable at HEAD `e61f8a91`)

**0 HIGH, 0 MEDIUM, 0 LOW NEW**, plus carry-forward DEFERRED items unchanged in status.

All finite-severity findings raised by every cycle-4 lane resolve to cycle-3 carry-forwards. The deploy-script change surface is identical to cycle-3, and the `src/` tree has not changed since cycle 3.

The actionable item this cycle is **C4-CT-1**'s recommendation to pick 1–2 LOW deferred items off the backlog and implement them in this cycle, consistent with the orchestrator's "make forward progress on backlog, not just accumulate it" directive.

---

## Resolved at current HEAD (verified by inspection)

The cycle-3 aggregate already enumerated the resolved items from prior cycles. All remain resolved at HEAD `e61f8a91`:

- **C2-AGG-1** (chmod 0600 .env.production): RESOLVED. `deploy-docker.sh:277` (fresh-generation path) AND `deploy-docker.sh:283` (existing-file defense-in-depth) both apply `chmod 0600`. (Verifier C4-VER claim 1.)
- **C2-AGG-2A** (sshpass deploy-blocker): RESOLVED via cycle-2 commits `21125372` (SSH ControlMaster) + `66146861` (/tmp ControlPath fix). Cycle-3 deploy log shows 0 "Permission denied" lines. (Tracer C4-TR-1 trace 1.)
- **C2-AGG-3** (drizzle-force policy in repo docs): RESOLVED. `AGENTS.md` already documents the `DRIZZLE_PUSH_FORCE` policy.
- **C3-AGG-1** (cycle-2 plan stale Task B status): RESOLVED via cycle-3 closure note. (Tracer C4-TR-2.)

## Plan-vs-implementation reconciliation (cycle 3 → cycle 4)

Cycle 3 produced 3 commits; all are docs/plans. The cycle-3 plan (`plans/open/2026-04-29-rpf-cycle-3-review-remediation.md`) is internally consistent: Task A done; Tasks B–I deferred with explicit exit criteria; Task Z (gates + deploy) recorded `per-cycle-success`. No reconciliation drift to fix this cycle.

---

## NEW findings this cycle

**None.** All lanes report "no new HIGH/MEDIUM/LOW findings beyond cycle-3 carry-forwards". Verifier confirms all cycle-3 claims accurate at HEAD `e61f8a91`.

---

## Cycle-4 implementation queue (LOW backlog draw-down)

Per **C4-CT-1** (critic) and per the orchestrator's PROMPT 2 directive ("Pick one or two LOW deferred items off the backlog and schedule them for implementation in this cycle if feasible"), the following three LOW deferred items are scheduled for implementation **this cycle**:

1. **C3-AGG-7** — Document deploy-script env vars in `deploy-docker.sh:1-21` header docstring + add "Deploy hardening" subsection to `AGENTS.md`. Pure docs.
2. **C3-AGG-9** — Add a one-line comment on `deploy-docker.sh:151-152` clarifying that the explicit `chmod 700` after `mktemp -d` is defense-in-depth (mktemp -d already creates 0700). Pure code-comment.
3. **C3-AGG-10** — Add `info "SSH connection succeeded after ${attempt} attempts"` when `attempt > 1` in `_initial_ssh_check` (`deploy-docker.sh:165-178`). One-line code change.

**Why these three:**
- All three have naturally-met exit criteria ("any cycle that touches the file"), so picking them up does not violate any policy.
- Combined diff is <30 lines, all in `deploy-docker.sh` and `AGENTS.md`. No `src/` change.
- Risk: very low — additive only (no behavior change in steady state; only an extra log line on retry-success and clearer docs).
- Together they retire 3 of the 9 LOW items C3-AGG-2 through C3-AGG-10, materially drawing down the deferred-list count.

**Repo-policy compliance for the implementation:**
- GPG-signed commits with conventional commit + gitmoji format (per CLAUDE.md "Git Commit Rules" and project rules).
- Fine-grained commits (one per finding).
- `git pull --rebase` before `git push`.
- No `--no-verify`.
- No force-push to main.
- No Korean text touched (rule still binding but not relevant to deploy-script docs).
- `src/lib/auth/config.ts` not touched (preservation rule still binding).

---

## Carry-forward DEFERRED items (status verified at HEAD `e61f8a91`)

| ID | Severity | File+line | Status (this cycle) | Exit criterion |
| --- | --- | --- | --- | --- |
| C3-AGG-2 (= C2-AGG-2B) | LOW | `deploy-docker.sh:204-214` | DEFERRED | SSH/sudo credential rotation divergence on any target |
| C3-AGG-3 | LOW | `deploy-docker.sh:165-178` | DEFERRED | Long-host wait OR ControlSocket connection refused on flaky-network long-build |
| C3-AGG-4 (subsumes C2-AGG-4) | LOW | `package.json` / CI surface | DEFERRED | bash-lint CI gate added or another bash-syntax regression |
| C3-AGG-5 | LOW | `deploy-docker.sh` whole + `deploy.sh:58-66` | DEFERRED | `deploy-docker.sh` >1500 lines OR `deploy.sh` invoked OR 3 indep cycles modify SSH-helpers |
| C3-AGG-6 | LOW | `deploy-docker.sh:151` | DEFERRED | Multi-tenant deploy host added OR peer-user awareness reported |
| C3-AGG-7 | LOW | `deploy-docker.sh:1-21` + `AGENTS.md` | **IMPLEMENTING THIS CYCLE** | naturally met by this cycle's edit |
| C3-AGG-8 | LOW | `deploy-docker.sh:129-133` | DEFERRED | Real-world incident requiring multi-deploy log analysis |
| C3-AGG-9 | LOW | `deploy-docker.sh:151-152` | **IMPLEMENTING THIS CYCLE** | naturally met by this cycle's edit |
| C3-AGG-10 | LOW | `deploy-docker.sh:165-178` | **IMPLEMENTING THIS CYCLE** | naturally met by this cycle's edit |
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

No HIGH findings deferred. No security/correctness/data-loss findings deferred (all such findings are either RESOLVED at HEAD or implemented in earlier cycles).

---

## Cross-agent agreement summary (cycle 4)

- **Empty change surface**: 11 lanes agree.
- **No new HIGH/MEDIUM findings**: 11 lanes agree.
- **C3-AGG-7 as a target this cycle** (deploy-script header + AGENTS.md "Deploy hardening" subsection): 2 (critic C4-CT-1 + document-specialist C4-DOC-1/2).
- **C3-AGG-9 as a target this cycle** (chmod 700 redundancy comment): 1 (critic C4-CT-1).
- **C3-AGG-10 as a target this cycle** (succeeded-after-N-attempts log line): 2 (critic C4-CT-1 + debugger C4-DB-1).
- **All cycle-3 claims verify at HEAD**: verifier C4-VER claim-by-claim verification.

## Agent failures

None. All 11 reviewer perspectives produced artifacts in `.context/reviews/rpf-cycle-4-<agent>.md` (and the verifier in `.../rpf-cycle-4-verifier.md`).

---

## Implementation queue for PROMPT 3

Acted on this cycle (PROMPT 3 work):
- **C3-AGG-7** — `deploy-docker.sh` header docstring expansion + `AGENTS.md` "Deploy hardening" subsection. (1 commit, docs only.)
- **C3-AGG-9** — `deploy-docker.sh:151-152` chmod 700 clarifying comment. (1 commit, docs only.)
- **C3-AGG-10** — `_initial_ssh_check` "succeeded after N attempts" log line. (1 commit, code.)

Deferrable (recorded in plan with exit criteria):
- All other carry-forwards in the table above.

No HIGH or MEDIUM new findings this cycle. No security/correctness/data-loss findings deferred.
