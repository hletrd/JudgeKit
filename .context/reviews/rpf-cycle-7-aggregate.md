# RPF Cycle 7 — Aggregate Review (orchestrator-driven, 2026-04-29)

**Date:** 2026-04-29
**HEAD reviewed:** `45502305` (cycle-6 close-out: docs(plans) mark cycle 6 Tasks Z (gates+deploy) and ZZ (archive) done).
**Reviewers:** code-reviewer, perf-reviewer, security-reviewer, critic, architect, debugger, designer (source-level), document-specialist, test-engineer, tracer, verifier (11 lanes; per-agent files in `.context/reviews/rpf-cycle-7-<agent>.md`).
**Cycle change surface:** **0 commits, 0 files, 0 lines** vs prior cycle close-out HEAD `45502305`.

**Cycle-6 aggregate snapshot:** Preserved at `_aggregate-cycle-6.md` (snapshotted before this overwrite).

**Note on stale prior cycle-7 reviews:** A pre-existing set of cycle-7 reviews rooted at base commit `b0666b7a` (an earlier non-orchestrator run, dated 2026-04-24) was found at `.context/reviews/rpf-cycle-7-*.md`. Each reviewer overwrote those files with fresh orchestrator-driven cycle-7 reviews this cycle. The stale set's actionable findings (AGG-1 time-route-Date.now, AGG-2 plaintext-recruiting-tokens, plus 7 secondary findings) were re-validated at HEAD `45502305` — see "Stale prior cycle-7 findings — RESOLVED at HEAD" below.

---

## Total deduplicated NEW findings (still applicable at HEAD `45502305`)

**0 HIGH, 0 MEDIUM, 0 LOW NEW.** Empty change surface; no new issues introduced this cycle. The actionable items are (a) closing 2 stale cycle-7 findings already silently RESOLVED, (b) drawing down 2-3 LOW deferred items per orchestrator directive, and (c) record-keeping updates (count drift on C1-AGG-3, path-drift on ARCH-CARRY-2).

---

## Stale prior cycle-7 findings — RESOLVED at HEAD (verified by trace + grep)

The stale `b0666b7a`-rooted cycle-7 reviews enumerated 9 findings (AGG-1 through AGG-9). Re-validated at HEAD `45502305`:

| Stale ID | File | HEAD evidence | Disposition |
|---|---|---|---|
| AGG-1 (`/api/v1/time` uses Date.now) | `src/app/api/v1/time/route.ts` | `import { getDbNowMs } from "@/lib/db-time"`, `export const dynamic = "force-dynamic"`, `return NextResponse.json({ timestamp: await getDbNowMs() })` | **RESOLVED** at HEAD |
| AGG-2 (plaintext recruiting `token` column + index) | `src/lib/db/schema.pg.ts:940, 960` | Plaintext `token` column REMOVED entirely; only `tokenHash` + `ri_token_hash_idx` remain | **RESOLVED** at HEAD |
| AGG-3 (SSE O(n) eviction) | `src/app/api/v1/submissions/[id]/events/route.ts:48-63` | Still O(n); maps to ARCH-CARRY-2 (path-drift correction below) | **DEFERRED** under ARCH-CARRY-2 |
| AGG-4 (rate-limit sort) | `src/lib/security/in-memory-rate-limit.ts:41-47` | Still sorts on overflow; maps to AGG-2 in cycle-6 backlog | **DEFERRED** under AGG-2 |
| AGG-5 (no test for `/api/v1/time`) | `src/app/api/v1/time/route.ts` | Now valuable since endpoint uses `getDbNowMs()`. Test still missing | **IMPLEMENTING THIS CYCLE** (LOW draw-down) |
| AGG-6 (participant-status time-boundary tests) | `src/lib/assignments/participant-status.ts` | Tests still missing | **DEFERRED** (LOW; exit criterion: bug report on deadline boundary OR participant-status refactor cycle) |
| AGG-7 (decrypt plaintext fallback) | `src/lib/security/encryption.ts:79-81` | Documented behavior; advisory | **DEFERRED** (LOW; exit criterion: production tampering incident OR audit cycle) |
| AGG-8 (client console.error) | client components | HEAD count: **25** (up from 21 at cycle-6 aggregate, 19 at stale review). Maps to C1-AGG-3 (count update below) | **DEFERRED** under C1-AGG-3 (count updated to 25) |
| AGG-9 (dual rate-limiting modules) | `src/lib/security/{in-memory,api-,}rate-limit.ts` | 3 modules; advisory | **DEFERRED** (LOW; exit criterion: rate-limit consolidation cycle) |

The stale cycle-7 sub-findings (C7-CR-*, C7-PR-*, C7-SR-*, C7-TE-*, C7-AR-*, C7-DB-*, C7-UX-*, C7-DS-*) all reduce to AGG-1..9 above. C7-DB-1, C7-UX-1 (countdown clock-skew UX bug) are RESOLVED via AGG-1 fix.

---

## Resolved at current HEAD (verified by inspection)

The cycle-6 aggregate already enumerated resolved items from prior cycles. All remain resolved at HEAD `45502305`:

- **C2-AGG-1** (chmod 0600 .env.production): RESOLVED.
- **C2-AGG-2A** (sshpass deploy-blocker): RESOLVED.
- **C2-AGG-3** (drizzle-force policy in repo docs): RESOLVED.
- **C3-AGG-1** (cycle-2 plan stale Task B status): RESOLVED.
- **C3-AGG-7** (deploy-script env-var docs): RESOLVED.
- **C3-AGG-8** (DEPLOY_INSTANCE log prefix): RESOLVED.
- **C3-AGG-4** (lint:bash script): RESOLVED.
- **C3-AGG-9** (chmod 700 redundancy comment): RESOLVED.
- **C3-AGG-10** (succeeded-after-N-attempts log): RESOLVED.
- **C2-AGG-7** (recruiting hardcoded appUrl): RESOLVED.
- **Cycle-5 stale findings** (AGG-1..AGG-7): all RESOLVED.
- **C5-SR-1** (deploy-worker.sh sed-pattern collision): RESOLVED cycle-6 (already-correctly-implemented).
- **C3-AGG-2** (SUDO_PASSWORD decoupling): RESOLVED cycle-6 commit `72868cea`.
- **C3-AGG-3** (DEPLOY_SSH_RETRY_MAX env override): RESOLVED cycle-6 commit `2791d9a3`.
- **Stale-cycle-7 AGG-1, AGG-2** (time route, recruiting tokens): RESOLVED at HEAD (table above).

## Plan-vs-implementation reconciliation (cycle 6 → cycle 7)

Cycle 6 produced 5 commits (2 fine-grained code/build fixes: `72868cea` SUDO_PASSWORD decoupling, `2791d9a3` DEPLOY_SSH_RETRY_MAX env override; 3 plan/doc commits: `28dd4261` reviews+aggregate, `7d4066d5` cycle-6 plan + cycle-5 archive, `45502305` cycle-6 close-out). Cycle-6 plan (`plans/open/2026-04-29-rpf-cycle-6-review-remediation.md`) is internally consistent. Verifier-cycle-7 confirms all artifacts at HEAD. No reconciliation drift. Cycle-6 plan is ready to archive after cycle-7 plan publishes.

---

## NEW findings this cycle

**0 NEW (HIGH/MEDIUM/LOW).** Empty change surface. All 9 stale prior cycle-7 findings audit out as either silently RESOLVED at HEAD (AGG-1, AGG-2) or already-tracked carry-forwards (AGG-3..9).

---

## Path drift corrections this cycle (no severity change; carry-forward registry update)

Per critic + perf-reviewer + document-specialist + verifier 4-lane consensus:

| Carry-forward ID | Original path | Updated path at HEAD |
|---|---|---|
| ARCH-CARRY-2 | `src/lib/realtime/realtime-coordination.ts` only | **Now records BOTH sites:** `src/lib/realtime/realtime-coordination.ts` AND `src/app/api/v1/submissions/[id]/events/route.ts:48-63` (same O(n) eviction pattern in two distinct files) |
| C1-AGG-3 | "21 client console.error sites" | **25 at HEAD** (count drift; population variable; severity unchanged) |

Severity unchanged (no downgrade). Exit criteria preserved.

---

## Cycle-7 implementation queue (LOW backlog draw-down)

Per orchestrator's PROMPT 2 directive ("Pick at least 2-3 LOW deferred items, ideally 3"), and 8-lane cross-agent consensus (code-reviewer + perf-reviewer + security-reviewer + critic + architect + designer + test-engineer + verifier):

1. **Stale-cycle-7 AGG-1 closure** (doc-only, no code change) — Record `/api/v1/time` finding as silently RESOLVED at HEAD; remove from active backlog.
2. **Stale-cycle-7 AGG-2 closure** (doc-only, no code change) — Record plaintext-recruiting-token finding as silently RESOLVED at HEAD; remove from active backlog.
3. **Stale-cycle-7 AGG-5 implementation: unit test for `/api/v1/time`** (`src/app/api/v1/time/route.ts` route now uses `getDbNowMs()`; test gap is now valuable). Effort: ≤ 50 lines including imports + setup. Mock `getDbNowMs()`, assert response shape + finite positive integer + mocked-value passthrough.

**Why these three:**
- Combined diff < 80 lines (only the test file is code change).
- Two are doc-only closures of items already silently fixed (zero code risk).
- One is a small targeted test addition that retires a clear gap on a route that's now critical for client time-sync.
- All within repo policy (GPG-signed, conventional + gitmoji, no `--no-verify`, no force-push, no Korean text touched, `src/lib/auth/config.ts` not touched).

**Deferred-pick alternative (rejected this cycle):** `useVisibilityAwarePolling` hook extraction for C2-AGG-5. Reason for rejection: 7th-instance trigger not yet met (only 4-6 sites at HEAD); helper extraction without active need is gold-plating. Defer with exit criterion unchanged (7th instance OR refactor cycle opens). May be picked in cycle 8 if 7th instance lands.

**Repo-policy compliance for the implementation:**
- GPG-signed commits with conventional commit + gitmoji (per CLAUDE.md "Git Commit Rules").
- Fine-grained commits (one per finding).
- `git pull --rebase` before `git push`.
- No `--no-verify`.
- No force-push to main.
- No Korean text touched.
- `src/lib/auth/config.ts` not touched.

---

## Carry-forward DEFERRED items (status verified at HEAD `45502305`)

| ID | Severity | File+line (corrected for HEAD) | Status (this cycle) | Exit criterion |
| --- | --- | --- | --- | --- |
| C3-AGG-5 | LOW | `deploy-docker.sh` (whole, **1076 lines** at HEAD) + `deploy.sh:58-66` | DEFERRED | `deploy-docker.sh` >1500 lines OR `deploy.sh` invoked OR 3 indep cycles modify SSH-helpers (touch counter at 2 after cycle-6) |
| C3-AGG-6 | LOW | `deploy-docker.sh:182-191` | DEFERRED | Multi-tenant deploy host added OR peer-user awareness reported |
| C2-AGG-5 | LOW | 4-6 polling components | DEFERRED | Telemetry signal OR 7th instance |
| C2-AGG-6 | LOW | `src/app/(public)/practice/page.tsx:417` | DEFERRED | p99 > 1.5s OR > 5k matching problems |
| C1-AGG-3 | LOW | client `console.error` sites (**count = 25** at HEAD; was reported as 21) | DEFERRED | Telemetry/observability cycle opens |
| DEFER-ENV-GATES | LOW | Env-blocked tests | DEFERRED | Fully provisioned CI/host with DATABASE_URL, Postgres, sidecar |
| D1 | MEDIUM | `src/lib/auth/...` JWT clock-skew (NOT `src/lib/auth/config.ts`) | DEFERRED | Auth-perf cycle; **fix must live OUTSIDE `src/lib/auth/config.ts` per CLAUDE.md "Preserve Production config.ts"** |
| D2 | MEDIUM | `src/lib/auth/...` JWT DB query per request (NOT `src/lib/auth/config.ts`) | DEFERRED | Auth-perf cycle; **fix must live OUTSIDE `src/lib/auth/config.ts`** |
| AGG-2 | MEDIUM | `src/lib/security/in-memory-rate-limit.ts` lines 22, 24, 56, 75, 100, 149 (Date.now hot path); also overflow-sort lines 41-47 | DEFERRED | Rate-limit-time perf cycle |
| ARCH-CARRY-1 | MEDIUM | 20 raw of 104 API route handlers (down from 22+) | DEFERRED | API-handler refactor cycle |
| ARCH-CARRY-2 | LOW | **TWO sites updated:** `src/lib/realtime/realtime-coordination.ts` AND `src/app/api/v1/submissions/[id]/events/route.ts:48-63` (same O(n) SSE eviction pattern) | DEFERRED | SSE perf cycle OR > 500 concurrent connections |
| PERF-3 | MEDIUM | `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:191-225` | DEFERRED | Anti-cheat dashboard p99 > 800ms OR > 50 concurrent contests viewed simultaneously |
| C7-AGG-6 (stale-cycle-7-carry) | LOW | `src/lib/assignments/participant-status.ts` time-boundary tests | DEFERRED | Bug report on deadline boundary OR participant-status refactor cycle |
| C7-AGG-7 (stale-cycle-7-carry) | LOW | `src/lib/security/encryption.ts:79-81` decrypt plaintext fallback | DEFERRED | Production tampering incident OR audit cycle |
| C7-AGG-9 (stale-cycle-7-carry) | LOW | `src/lib/security/{in-memory,api-,}rate-limit.ts` 3-module duplication | DEFERRED | Rate-limit consolidation cycle |
| C7-DS-1 (stale-cycle-7-carry) | LOW | `README.md` missing `/api/v1/time` endpoint doc | DEFERRED | README rewrite cycle OR developer-onboarding question filed |
| C7-DB-2-upper-bound | LOW | `deploy-docker.sh:224` `DEPLOY_SSH_RETRY_MAX` no upper bound | DEFERRED | Operator footgun report OR explicit cap requested |

No HIGH findings deferred. No security/correctness/data-loss findings deferred.

---

## Cross-agent agreement summary (cycle 7)

- **Empty change surface**: 11 lanes agree.
- **No new HIGH/MEDIUM/LOW findings**: 11 lanes agree.
- **Stale prior cycle-7 AGG-1 + AGG-2 RESOLVED at HEAD**: code-reviewer + security-reviewer + tracer + critic + verifier + designer + debugger (7-lane consensus).
- **AGG-5 (unit test for `/api/v1/time`) as cycle-7 LOW draw-down pick**: code-reviewer + critic + test-engineer + verifier (4-lane consensus).
- **Doc-only closure of AGG-1 + AGG-2 as cycle-7 LOW draw-down picks**: 8-lane consensus (all reviewers concur).
- **C2-AGG-5 hook extraction deferred to cycle 8**: code-reviewer + perf-reviewer + critic + architect + designer (5 of original 6 recommending — verifier neutral, debugger/document-specialist/security-reviewer/test-engineer/tracer don't opine).
- **Path drift corrections (ARCH-CARRY-2 dual sites; C1-AGG-3 count = 25)**: code-reviewer + critic + perf-reviewer + document-specialist + verifier (5 lanes).
- **D1/D2 implementation-must-live-outside-config.ts annotation**: critic + security-reviewer + verifier (3 lanes).

## Agent failures

None. All 11 reviewer perspectives produced artifacts in `.context/reviews/rpf-cycle-7-<agent>.md`.

---

## Implementation queue for PROMPT 3

Acted on this cycle (PROMPT 3 work):
- **Stale-AGG-1 closure** (doc-only): record in cycle-7 plan.
- **Stale-AGG-2 closure** (doc-only): record in cycle-7 plan.
- **Stale-AGG-5 implementation**: add unit test at `tests/unit/api/v1/time.test.ts` (or similar path) covering response shape + finite positive integer + mocked-value passthrough.

Deferrable (recorded in plan with exit criteria):
- All carry-forwards in the table above (ARCH-CARRY-2 path-drift correction; C1-AGG-3 count update; C2-AGG-5 hook extraction deferred to cycle 8).

No HIGH or MEDIUM new findings this cycle. No security/correctness/data-loss findings deferred.
