# RPF Cycle 4 — Aggregate Review (orchestrator-driven, 2026-04-29)

**Date:** 2026-04-29
**HEAD reviewed:** `e61f8a91` (cycle 3 close-out: docs(plans) record cycle 3 deploy outcome — per-cycle-success).
**Reviewers (10 perspectives, single-agent multi-pass):** code-reviewer, perf-reviewer, security-reviewer, critic, architect, debugger, designer (source-level), document-specialist, test-engineer, tracer, verifier (verifier merged into the lane list as the verification pass).
**Cycle change surface:** None — cycle 3 made zero `src/` changes. The three cycle-3 commits were all `docs(plans)` / `docs(reviews)` only.

This file is the dedicated aggregate for cycle 4. The repo-wide `_aggregate.md` is rebuilt below to match.

**Note on stale cycle-4 artifacts:** Earlier `rpf-cycle-4-*.md` files on disk dated 2026-04-23 at commit `d4b7a731` were from an unrelated prior RPF run. They have been overwritten with this cycle's reviews at HEAD `e61f8a91`. The cycle-3 aggregate has been preserved at `_aggregate-cycle-3.md` before the repo-wide `_aggregate.md` is rewritten.

---

## Total deduplicated findings

**0 HIGH, 0 MEDIUM, 0 LOW NEW**, plus 14+ carry-forward DEFERRED items unchanged in status. All finite-severity findings raised by every cycle-4 lane resolve to cycle-3 carry-forwards.

The actionable item this cycle is C4-CT-1's recommendation to pick 1–2 LOW deferred items off the backlog and implement them this cycle (consistent with the orchestrator's "make forward progress on backlog, not just accumulate it" directive in PROMPT 2).

---

## Resolved at current HEAD (verified by inspection)

The cycle-3 `_aggregate.md` already enumerated the resolved items from prior cycles. All remain resolved at HEAD `e61f8a91`:

- **C2-AGG-1** (chmod 0600 .env.production): RESOLVED.
- **C2-AGG-2A** (sshpass deploy-blocker): RESOLVED.
- **C2-AGG-3** (drizzle-force policy in repo docs): RESOLVED.
- All cycle-3 INFO claims verify (verifier C4-VER).

---

## Carry-forward DEFERRED items (status verified at HEAD `e61f8a91`)

| ID | Severity | File+line | Status | Exit criterion |
| --- | --- | --- | --- | --- |
| C3-AGG-2 (= C2-AGG-2B) | LOW | `deploy-docker.sh:204-214` | DEFERRED — TARGETED FOR FUTURE | SSH/sudo credential rotation divergence on any target |
| C3-AGG-3 | LOW | `deploy-docker.sh:165-178` | DEFERRED | Long-host wait OR ControlSocket connection refused on flaky-network long-build |
| C3-AGG-4 (subsumes C2-AGG-4) | LOW | `package.json` / CI surface | DEFERRED | bash-lint CI gate added or another bash-syntax regression |
| C3-AGG-5 | LOW | `deploy-docker.sh` whole + `deploy.sh:58-66` | DEFERRED | `deploy-docker.sh` >1500 lines OR `deploy.sh` invoked OR 3 indep cycles modify SSH-helpers |
| C3-AGG-6 | LOW | `deploy-docker.sh:151` | DEFERRED | Multi-tenant deploy host added OR peer-user awareness reported |
| C3-AGG-7 | LOW | `deploy-docker.sh:1-21` + `AGENTS.md` | **TARGETED FOR FIX THIS CYCLE** (per C4-CT-1) | Naturally met when any cycle touches deploy-script header or `AGENTS.md` |
| C3-AGG-8 | LOW | `deploy-docker.sh:129-133` | DEFERRED | Real-world incident requiring multi-deploy log analysis |
| C3-AGG-9 | LOW | `deploy-docker.sh:151-152` | **TARGETED FOR FIX THIS CYCLE** (per C4-CT-1) | Naturally met when any cycle touches that line range |
| C3-AGG-10 | LOW | `deploy-docker.sh:165-178` | **TARGETED FOR FIX THIS CYCLE** (per C4-CT-1) | Naturally met when any cycle touches `_initial_ssh_check` |
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

No HIGH findings deferred. No security/correctness/data-loss findings deferred.

---

## Cycle-4 implementation queue

Per C4-CT-1, this cycle should pick at least one LOW deferred item off the backlog. Selected items:

1. **C3-AGG-7** — Document deploy-script env vars in `deploy-docker.sh` header + add `AGENTS.md` "Deploy hardening" subsection. Pure docs.
2. **C3-AGG-9** — Add a one-line comment on `chmod 700` after `mktemp -d` clarifying defense-in-depth. One line.
3. **C3-AGG-10** — Add `info "SSH connection succeeded after ${attempt} attempts"` when attempt > 1. One-line code change.

All three are LOW with naturally-met exit criteria. All three together are <30 lines of change concentrated in `deploy-docker.sh` and `AGENTS.md`. Risk: very low (additive only; no behavior change).

---

## Cross-agent agreement summary

- **C3-AGG-7** as a target: 2 (critic C4-CT-1 + document-specialist C4-DOC-1/2).
- **C3-AGG-9** as a target: 1 (critic C4-CT-1).
- **C3-AGG-10** as a target: 2 (critic C4-CT-1 + debugger C4-DB-1).
- **No new HIGH/MEDIUM findings**: 10 (all lanes agree).
- **`src/` change surface empty**: 10 (all lanes agree).

## Agent failures

None. All 10 reviewer perspectives produced artifacts in `.context/reviews/rpf-cycle-4-<agent>.md`. The verifier perspective is recorded in `rpf-cycle-4-verifier.md` and merged into this aggregate.

---

## Implementation queue for PROMPT 3

Acted on this cycle:
- **C3-AGG-7** (deploy-script header + AGENTS.md "Deploy hardening" subsection).
- **C3-AGG-9** (chmod 700 redundancy comment).
- **C3-AGG-10** (succeeded-after-N-attempts log line).

Remaining deferrable (no exit criterion newly met):
- All other carry-forwards in the table above.

No HIGH or MEDIUM new findings this cycle. No security/correctness/data-loss findings deferred.
