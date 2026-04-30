# Cycle 10 Review Remediation Plan (RPF current loop)

**Date:** 2026-04-29
**Source:** `.context/reviews/_aggregate.md` (cycle 10) + cycle-10 lane reviews + `plans/user-injected/pending-next-cycle.md`
**HEAD entering this cycle:** `6ba729ed` (cycle-9 close-out)
**Status:** IN PROGRESS

---

## Cycle entry-state summary

- Cycles 4-9 NEW_FINDINGS sequence: 0/1/0/0/0/0. Cycle 9 closed 3 LOW deferred items via doc-only mitigation (LOW-DS-3 trigger record, LOW-DS-1 README dev-scripts, C7-AGG-7 partial JSDoc). Backlog monotonically shrinking on the LOW-mitigation tier.
- Cycle-10 review surface: 6 commits since cycle-8 close (all doc/markdown/JSDoc); 0 NEW (HIGH/MEDIUM/LOW) findings across all 11 lanes.
- Stale cycle-10 review files dated 2026-04-24 (HEAD `b6151c2a`) listed 8 C10-CR-* findings — **all 8 verified resolved at current HEAD** (overwritten this cycle with current cycle-10 content).
- Pending user-injected TODOs: TODO #1 closed (cycle 1 RPF). No new TODOs in `plans/user-injected/pending-next-cycle.md`.
- This cycle's deploy must NOT preemptively set `DRIZZLE_PUSH_FORCE=1`.

## Stale plan inventory in `plans/open/` at cycle-10 start

| File | From loop | Status in file | Action needed |
|---|---|---|---|
| `2026-04-28-rpf-cycle-9-review-remediation.md` | prior RPF loop (HEAD `b6151c2a`) | Status: DONE, all `[x]` | Archive to `plans/closed/` (LOW-DS-4 / Task A) |
| `2026-04-28-rpf-cycle-10-review-remediation.md` | prior RPF loop | Status: DONE, all `[x]` | Archive to `plans/closed/` (LOW-DS-5 / Task B) |
| `2026-04-28-rpf-cycle-11-review-remediation.md` | prior RPF loop | Status: DONE, all `[x]` | Archive to `plans/closed/` (LOW-DS-5 / Task B) |
| `2026-04-29-rpf-cycle-1-review-remediation.md` | current loop, cycle 1 | Status: IN PROGRESS but all tasks `[x]` (or deferred) | Move to `plans/done/` (Task C) |
| `2026-04-29-rpf-cycle-2-review-remediation.md` | current loop, cycle 2 | Status: IN PROGRESS but all tasks `[x]` | Move to `plans/done/` (Task C) |
| `2026-04-29-rpf-cycle-9-review-remediation.md` | current loop, cycle 9 | Status: DONE, all `[x]` (per close-out commit `6ba729ed`) | Move to `plans/done/` (Task ZZ) |

---

## Tasks

### Task A: [LOW — DOING THIS CYCLE] Archive stale duplicate cycle-9 plan from `plans/open/` (LOW-DS-4 / CRT-1)

- **Source:** cycle-10 critic CRT-1 + document-specialist LOW-DS-4
- **File:** `plans/open/2026-04-28-rpf-cycle-9-review-remediation.md` (predates the current loop's cycle-9 execution date)
- **Verification:** file Status: DONE; all tasks `[x]`; targets fixes from prior RPF loop (HEAD `b6151c2a`) which are all resolved at current HEAD.
- **Fix:** `git mv plans/open/2026-04-28-rpf-cycle-9-review-remediation.md plans/closed/2026-04-28-rpf-cycle-9-review-remediation.md`
- **Exit criteria:** file no longer in `plans/open/`; appears in `plans/closed/`; commit GPG-signed, conventional + gitmoji, no source-code touched.
- **Status:** [ ] Pending

### Task B: [LOW — DOING THIS CYCLE] Archive stale duplicate cycle-10 + cycle-11 plans from prior RPF loop (LOW-DS-5 / CRT-2)

- **Source:** cycle-10 critic CRT-2 + document-specialist LOW-DS-5
- **Files:**
  - `plans/open/2026-04-28-rpf-cycle-10-review-remediation.md` (prior RPF loop, all `[x]` Done)
  - `plans/open/2026-04-28-rpf-cycle-11-review-remediation.md` (prior RPF loop, all `[x]` Done)
- **Verification:** both files Status: DONE; all tasks `[x]`; both reference C10/C11 dark-mode variant findings — all 8 C10-CR-* findings verified resolved at current HEAD per cycle-10 verifier lane.
- **Fix:** `git mv` both to `plans/closed/`.
- **Exit criteria:** both files no longer in `plans/open/`; both in `plans/closed/`; one commit covering both moves.
- **Status:** [ ] Pending

### Task C: [LOW — DOING THIS CYCLE] Move current-loop cycle-1 + cycle-2 plans to `plans/done/`

- **Source:** Cycle-10 housekeeping (cycles 1 + 2 of the current RPF loop are fully complete; user-injected TODO #1 closure noted in pending-next-cycle.md states cycle 1 plan tasks all done)
- **Files:**
  - `plans/open/2026-04-29-rpf-cycle-1-review-remediation.md` — all tasks `[x]` Done or `[x]` Deferred per file inspection.
  - `plans/open/2026-04-29-rpf-cycle-2-review-remediation.md` — Tasks A/B/Z `[x]` Done; Tasks C-G `[x]` Deferred (prior cycle).
- **Fix:** `git mv` both to `plans/done/`.
- **Exit criteria:** both files no longer in `plans/open/`; both in `plans/done/`. Single commit covering both moves with body explaining the deferred-vs-done state.
- **Status:** [ ] Pending

### Task D: [LOW — CLOSING THIS CYCLE] LOW-DS-2 effective closure

- **Source:** cycle-10 document-specialist
- **Item:** LOW-DS-2 (cycle-9 NEW) — README full-script enumeration. Cycle-9 Task B's "Development Scripts" section (lines 274-280) covers lint, lint:bash, tsc, build, test:unit/integration/component/security/e2e. This closely satisfies the original LOW-DS-2 intent.
- **Fix:** annotate as CLOSED in this plan (no source-code action). The aggregate registry entry already reflects this closure.
- **Exit criteria:** annotation in this plan; no carry-forward in next cycle's aggregate.
- **Status:** [x] Closed (effectively addressed by cycle-9 Task B)

### Task E: [LOW — DEFERRED] All other carry-forward items unchanged (with path drift corrections)

Carry-forward registry, status verified at HEAD `6ba729ed` (per aggregate):

| ID | Severity | File+line at HEAD | Reason | Exit criterion |
|---|---|---|---|---|
| C3-AGG-5 | LOW | `deploy-docker.sh` (1098 lines) + `deploy.sh:58-66` | Trigger threshold met cycle 8; record landed cycle 9; touch counter 3 unchanged | Modular extraction OR file >1500 lines OR `deploy.sh` invoked OR next SSH-helpers edit |
| C3-AGG-6 | LOW | `deploy-docker.sh:182-191` | Single-tenant deploy host assumption | Multi-tenant deploy OR peer-user awareness reported |
| C2-AGG-5 | LOW | 5 polling components | No telemetry signal | Telemetry signal OR 7th instance |
| C2-AGG-6 | LOW | `src/app/(public)/practice/page.tsx:417` | Performance trigger not met | p99 > 1.5s OR > 5k matching problems |
| C1-AGG-3 | LOW | client `console.error` sites (24 at HEAD) | Telemetry/observability cycle not opened | Telemetry cycle opens |
| DEFER-ENV-GATES | LOW | env-blocked tests | dev-shell limitations | Fully provisioned CI/host with DATABASE_URL, Postgres, sidecar |
| D1 | MEDIUM | `src/lib/auth/...` JWT clock-skew (NOT `config.ts`) | Auth-perf cycle scope | Auth-perf cycle; **fix outside `src/lib/auth/config.ts`** |
| D2 | MEDIUM | `src/lib/auth/...` JWT DB-per-request (NOT `config.ts`) | Auth-perf cycle scope | Auth-perf cycle; **fix outside `src/lib/auth/config.ts`** |
| AGG-2 | MEDIUM | `src/lib/security/in-memory-rate-limit.ts` lines **31, 33, 65, 84, 109, 158** (Date.now) + 41-47 (overflow sort) | No telemetry pressure; doc-only mitigation tier | Rate-limit-time perf cycle; sharper criterion: rate-limit module touched 2 more times |
| ARCH-CARRY-1 | MEDIUM | 20 raw of 104 API route handlers | 20-handler refactor too large for one cycle; exemplar would create third pattern | API-handler refactor cycle |
| ARCH-CARRY-2 | LOW | `src/lib/realtime/realtime-coordination.ts` AND `src/app/api/v1/submissions/[id]/events/route.ts:48-63` | Trigger not met | SSE perf cycle OR > 500 concurrent connections |
| PERF-3 | MEDIUM | `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:191-225` | Query rewrite + index work too large for one cycle | Anti-cheat dashboard p99 > 800ms OR > 50 concurrent contests |
| C7-AGG-6 (carry) | LOW | `src/lib/assignments/participant-status.ts` time-boundary tests | Trigger not met | Bug report on deadline boundary OR participant-status refactor cycle |
| C7-AGG-7 (carry) | LOW | `src/lib/security/encryption.ts:79-81` plaintext fallback | Migration compatibility; warn-log audit trail in place; cycle-9 head JSDoc landed | Production tampering incident OR audit cycle |
| C7-AGG-9 (carry) | LOW | `src/lib/security/{in-memory,api-,}rate-limit.ts` 3-module duplication | Cycle-8 cross-reference orientation comments mitigation | Rate-limit consolidation cycle |

No HIGH findings deferred. No security/correctness/data-loss findings deferred. All deferred items have file+line, original severity (no downgrade), concrete reason, and exit criterion.

- **Status:** [ ] All deferred this cycle (status preserved); resolved when triggers met.

### Task Z: [INFO — DOING THIS CYCLE] Run all configured gates and the deploy

Per orchestrator PROMPT 3:
- `npm run lint` — error-blocking; warnings best-effort.
- `npx tsc --noEmit` — error-blocking.
- `npm run build` — error-blocking.
- `npm run test:unit` — error-blocking; env-skipped tests recorded as DEFER-ENV-GATES.
- `npm run test:integration` — env-blocked → DEFER-ENV-GATES (no DATABASE_URL/Postgres in dev shell).
- `npm run test:component` — error-blocking; env-skipped tests recorded as DEFER-ENV-GATES.
- `npm run test:security` — error-blocking.
- `npm run test:e2e` — best-effort; env-blocked → DEFER-ENV-GATES (no Playwright sidecar).
- Deploy: `SKIP_LANGUAGES=true BUILD_WORKER_IMAGE=false INCLUDE_WORKER=false ./deploy-docker.sh`. **DRIZZLE_PUSH_FORCE=1 NOT preemptively set** (per orchestrator directive). Success → `per-cycle-success`; failure → one recovery; if still failing → `per-cycle-failed:<reason>`.
- **Status:** [ ] Pending

### Task ZZ: [INFO — DOING THIS CYCLE] Archive cycle-9 plan to `plans/done/`

- **File:** `plans/open/2026-04-29-rpf-cycle-9-review-remediation.md` — Status: DONE, all `[x]`.
- **Fix:** `git mv plans/open/2026-04-29-rpf-cycle-9-review-remediation.md plans/done/2026-04-29-rpf-cycle-9-review-remediation.md`
- **Exit criteria:** cycle-9 plan in `plans/done/`; not in `plans/open/`.
- **Status:** [ ] Pending

---

## Cycle close-out checklist

- [ ] Task A committed (LOW-DS-4, GPG-signed, conventional + gitmoji).
- [ ] Task B committed (LOW-DS-5, GPG-signed, conventional + gitmoji).
- [ ] Task C committed (current-loop cycle-1+2 archive, GPG-signed, conventional + gitmoji).
- [x] Task D closure annotated (LOW-DS-2 effectively addressed; no commit needed).
- [ ] Cycle-10 plan committed (this file).
- [ ] Cycle-9 plan archived (Task ZZ, separate commit).
- [ ] Reviews + aggregate snapshot committed (single commit covering all 11 lane files + `_aggregate.md` overwrite + `_aggregate-cycle-9.md` snapshot).
- [ ] All gates green or DEFER-ENV-GATES-skipped with explanation (Task Z).
- [ ] Deploy outcome recorded in this plan (Task Z).
- [ ] End-of-cycle report emitted by the orchestrator wrapper.

## Repo-policy compliance for the cycle-10 implementation

- GPG-signed commits with conventional commit + gitmoji (no `--no-verify`, no `--no-gpg-sign`).
- Fine-grained commits (one per finding/task).
- `git pull --rebase` before `git push`. No force-push to main.
- No Korean text touched. `src/lib/auth/config.ts` not touched.
- Deploy: per-cycle (`SKIP_LANGUAGES=true BUILD_WORKER_IMAGE=false INCLUDE_WORKER=false ./deploy-docker.sh`).
- DRIZZLE_PUSH_FORCE=1 NOT preemptively set.
- No `docker system prune --volumes` on production.
