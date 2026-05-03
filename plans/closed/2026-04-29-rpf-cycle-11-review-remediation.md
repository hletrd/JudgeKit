# SUPERSEDED (prior RPF loop, archived 2026-05-03 by cycle-4 CYC4-AGG-1)

> This plan is from a prior RPF loop (loop cycle 11/100, HEAD
> `7073809b`, no longer reachable from `main`). The current loop
> (cycles 1-4 at HEAD `7a195b11`) supersedes its task list. Kept for
> historical provenance only — do NOT act on the tasks below; they
> reference deferral registries and HEADs that have moved on. See
> `plans/done/2026-05-04-rpf-cycle-3-review-remediation.md` and
> `plans/open/2026-05-04-rpf-cycle-4-review-remediation.md` for
> the current loop's task lists.

---

# Cycle 11 Review Remediation Plan (RPF current loop)

**Date:** 2026-04-29
**Source:** `.context/reviews/_aggregate.md` (cycle 11) + cycle-11 lane reviews + `plans/user-injected/pending-next-cycle.md`
**HEAD entering this cycle:** `7073809b` (cycle-10 close-out: docs(plans) ✅ record cycle 10 task outcomes and deploy success in plan body)
**Status:** IN PROGRESS (superseded — see header)

---

## Cycle entry-state summary

- Cycles 4-10 NEW_FINDINGS sequence: 0/1/0/0/0/0/0. Cycle 10 closed 3 LOW housekeeping items (LOW-DS-4 stale cycle-9 plan archive, LOW-DS-5 stale cycle-10/11 plans archive, current-loop cycle-1+2 archive) + LOW-DS-2 closure annotation.
- Cycle-11 review surface: 6 commits since cycle-9 close (`6ba729ed` → `7073809b`), all markdown/plan-body. **Zero source code lines touched.**
- Stale prior-loop `rpf-cycle-11-*` review files dated 2026-04-24 (HEAD `b6151c2a`) flagged a `preparePluginConfigForStorage` `enc:v1:` prefix bypass. **That bug has already been silently fixed in the current code** — `src/lib/plugins/secrets.ts:154` uses `isValidEncryptedPluginSecret()` (full structural check, lines 27-34), with inline citation at line 158 to `(CR11-1, CR12-1)`.
- Pending user-injected TODOs: TODO #1 (workspace → public migration) was closed cycle 1 RPF (per `plans/user-injected/pending-next-cycle.md`). No new TODOs.
- This cycle's deploy must NOT preemptively set `DRIZZLE_PUSH_FORCE=1`.

## Plan inventory in `plans/open/` at cycle-11 start

| File | From loop | Status | Action needed |
|---|---|---|---|
| `2026-04-19-cycle-10-review-remediation.md` | prior loop | Status: legacy | Leave (not part of current RPF loop registry) |
| `2026-04-19-cycle-15-review-remediation.md` | prior loop | Status: legacy | Leave |
| `2026-04-19-cycle-19-review-remediation.md` | prior loop | Status: legacy | Leave |
| `2026-04-22-rpf-cycle-3-review-remediation.md`, `cycle-4`, `cycle-13`, `cycle-19`, `cycle-23`, `cycle-30` | prior RPF loop | Status: DONE per file body | Out of scope this cycle (housekeeping was done cycle 10 for the highest-priority duplicates) |
| `2026-04-28-rpf-cycle-1-review-remediation.md` | prior RPF loop, cycle 1 | Status: IN PROGRESS but tasks are stale | Out of scope this cycle |
| `2026-04-29-rpf-cycle-11-review-remediation.md` (this file) | current loop, cycle 11 | Status: IN PROGRESS | This cycle |

(The cycle-10 plan was archived to `plans/done/` already per cycle-10 close-out commits `e5e96d2c` and `7073809b`. Verified via `ls plans/done/2026-04-29-rpf-cycle-10-review-remediation.md` returning a 165-line file with Status: DONE.)

---

## Tasks

### Task A: [LOW — DOING THIS CYCLE] Record CR11-CR1 closure (silently fixed at HEAD)

- **Source:** cycle-11 5-lane consensus (code-reviewer + security-reviewer + critic + debugger + tracer)
- **Stale finding:** prior-loop `.context/reviews/rpf-cycle-11-*.md` (dated 2026-04-24, HEAD `b6151c2a`) flagged `preparePluginConfigForStorage` `enc:v1:` prefix bypass at `src/lib/plugins/secrets.ts:132-136`. The bug allowed admin-submitted values starting with `enc:v1:` to bypass encryption, ending up as plaintext-with-prefix in the DB.
- **Status at HEAD `7073809b`:** SILENTLY FIXED. The code now uses `isValidEncryptedPluginSecret()` (a full structural validator at lines 27-34) instead of the prefix-only `isEncryptedPluginSecret()`. Inline comment at line 158 cites `(CR11-1, CR12-1)` linking the current code to the originating finding.
- **Verification at HEAD:**
  - `src/lib/plugins/secrets.ts:27-34` defines `isValidEncryptedPluginSecret`. ✓
  - `src/lib/plugins/secrets.ts:154` calls it (not the prefix-only check). ✓
  - `src/lib/plugins/secrets.ts:158` cites `CR11-1, CR12-1` inline. ✓
  - 5-lane convergence (code-reviewer + security-reviewer + critic + debugger + tracer) all confirmed.
- **Fix:** record closure in this plan + in cycle-11 aggregate (already done in commit class `docs(reviews): 📝 add RPF cycle 11 reviews and aggregate`). Stale prior-loop review files at `.context/reviews/rpf-cycle-11-*.md` overwritten by this cycle's fresh files. **No source-code commit needed.**
- **Exit criteria:** closure recorded in this plan (Task A `[x]` Done) + recorded in cycle-11 aggregate carry-forward registry. Stale review files no longer reference an active backlog item.
- **Outcome:** Closed this cycle (record-keeping). Code fix landed before HEAD `7073809b` (cited as `CR11-1, CR12-1`).
- [x] Done.

### Task B: [LOW — DOING THIS CYCLE] All other carry-forward items unchanged (with path drift noted)

Carry-forward registry, status verified at HEAD `7073809b` (per aggregate):

| ID | Severity | File+line at HEAD | Reason | Exit criterion |
|---|---|---|---|---|
| C3-AGG-5 | LOW | `deploy-docker.sh` (1098 lines) + `deploy.sh:58-66` | Touch counter 3 unchanged this cycle | Modular extraction OR file >1500 lines OR `deploy.sh` invoked OR next SSH-helpers edit |
| C3-AGG-6 | LOW | `deploy-docker.sh:182-191` | Single-tenant deploy host assumption | Multi-tenant deploy OR peer-user awareness reported |
| C2-AGG-5 | LOW | 5 polling components | No telemetry signal | Telemetry signal OR 7th instance |
| C2-AGG-6 | LOW | `src/app/(public)/practice/page.tsx:417` | Performance trigger not met | p99 > 1.5s OR > 5k matching problems |
| C1-AGG-3 | LOW | client `console.error` sites (25 at HEAD; +1 drift from 24 — not regression) | Telemetry/observability cycle not opened | Telemetry cycle opens |
| DEFER-ENV-GATES | LOW | env-blocked tests | dev-shell limitations | Fully provisioned CI/host with DATABASE_URL, Postgres, sidecar |
| D1 | MEDIUM | `src/lib/auth/...` JWT clock-skew (NOT `config.ts`) | Auth-perf cycle scope | Auth-perf cycle; **fix outside `src/lib/auth/config.ts`** |
| D2 | MEDIUM | `src/lib/auth/...` JWT DB-per-request (NOT `config.ts`) | Auth-perf cycle scope | Auth-perf cycle; **fix outside `src/lib/auth/config.ts`** |
| AGG-2 | MEDIUM | `src/lib/security/in-memory-rate-limit.ts` lines 31, 33, 65, 84, 109, 158 (Date.now) + 41-47 (overflow sort) | Trigger ("rate-limit module touched 2 more times") not tripped | Rate-limit-time perf cycle; sharper criterion preserved |
| ARCH-CARRY-1 | MEDIUM | 20 raw of 104 API route handlers | 20-handler refactor too large for one cycle; exemplar would create third pattern | API-handler refactor cycle |
| ARCH-CARRY-2 | LOW | `src/lib/realtime/realtime-coordination.ts` (254 lines) + `src/app/api/v1/submissions/[id]/events/route.ts` (566 lines) | Trigger not met | SSE perf cycle OR > 500 concurrent connections |
| PERF-3 | MEDIUM | `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts` (238 lines) | Query rewrite + index work too large for one cycle | Anti-cheat dashboard p99 > 800ms OR > 50 concurrent contests |
| C7-AGG-6 (carry) | LOW | `src/lib/assignments/participant-status.ts` time-boundary tests | Trigger not met | Bug report on deadline boundary OR participant-status refactor cycle |
| C7-AGG-7 (carry) | LOW | `src/lib/security/encryption.ts` plaintext fallback | Migration compatibility; warn-log audit trail in place; cycle-9 head JSDoc landed | Production tampering incident OR audit cycle |
| C7-AGG-9 (carry) | LOW | `src/lib/security/{in-memory,api-,}rate-limit.ts` 3-module duplication | Cycle-8 cross-reference orientation comments mitigation | Rate-limit consolidation cycle |

No HIGH findings deferred. No security/correctness/data-loss findings deferred. All deferred items have file+line, original severity (no downgrade), concrete reason, and exit criterion.

- [x] All deferred this cycle (status preserved); resolved when triggers met.

### Task Z: [INFO — DOING THIS CYCLE] Run all configured gates

Per orchestrator PROMPT 3:
- `npm run lint` — error-blocking; warnings best-effort.
- `npx tsc --noEmit` — error-blocking.
- `npm run build` — error-blocking.
- `npm run test:unit` — error-blocking; env-skipped tests recorded as DEFER-ENV-GATES.
- `npm run test:integration` — env-blocked → DEFER-ENV-GATES (no DATABASE_URL/Postgres in dev shell).
- `npm run test:component` — error-blocking; env-skipped tests recorded as DEFER-ENV-GATES.
- `npm run test:security` — error-blocking.
- `npm run test:e2e` — best-effort; env-blocked → DEFER-ENV-GATES (no Playwright sidecar).

**Deploy decision:** Per orchestrator PROMPT 3 ("If you have NO actionable changes, skip the deploy and emit DEPLOY: none-no-changes (with that exact value); do NOT redeploy unchanged code (wasteful)."), and given that this cycle's only commits are doc/plan markdown that don't affect runtime: **DEPLOY: none-no-changes**. DRIZZLE_PUSH_FORCE=1 NOT preemptively set (orchestrator directive — moot since no deploy).

- **Status:** [ ] Pending (gate run + outcome record)

### Task ZZ: [INFO — DOING THIS CYCLE] No archival action (cycle-10 plan already in `plans/done/`)

Cycle-10 plan was archived to `plans/done/2026-04-29-rpf-cycle-10-review-remediation.md` in cycle-10 commits `e5e96d2c` (initial mv) and `7073809b` (body annotation). Verified at HEAD: file present, Status: DONE, all `[x]` Done.

No archival action needed for this cycle. After this cycle closes, this plan (cycle-11) will be moved to `plans/done/` in a follow-up close-out commit if all tasks land.

- **Status:** [x] No-op (already archived)

---

## Cycle close-out checklist

- [x] Task A recorded (CR11-CR1 closure, no source-code commit)
- [x] Task B preserved (carry-forward registry verified at HEAD)
- [ ] Task Z gates run + outcomes recorded
- [ ] Cycle-11 reviews + aggregate snapshot committed (`docs(reviews): 📝 add RPF cycle 11 reviews and aggregate`)
- [ ] Cycle-11 plan committed (this file) (`docs(plans): 📝 add RPF cycle 11 plan`)
- [ ] DEPLOY: none-no-changes (no source-code change; redeploy wasteful)
- [ ] End-of-cycle report emitted by the orchestrator wrapper

## Repo-policy compliance for cycle-11 implementation

- GPG-signed commits with conventional commit + gitmoji (no `--no-verify`, no `--no-gpg-sign`).
- Fine-grained commits (one per artifact class).
- `git pull --rebase` before `git push`. No force-push to main.
- No Korean text touched. `src/lib/auth/config.ts` not touched.
- Deploy: `DEPLOY: none-no-changes` (no actionable runtime change; redeploy wasteful per PROMPT 3).
- DRIZZLE_PUSH_FORCE=1 NOT preemptively set (moot since no deploy).
- No `docker system prune --volumes` on production.
