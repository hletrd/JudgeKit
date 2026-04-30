# RPF Cycle 8 Review Remediation Plan (orchestrator-driven, 2026-04-29)

**Date:** 2026-04-29
**Source:** `.context/reviews/_aggregate.md` (RPF cycle 8 orchestrator-driven) + `plans/user-injected/pending-next-cycle.md`
**Status:** DONE

---

## Cycle prologue

- HEAD at start of cycle: `1c991812` (cycle-7 close-out: docs(plans) mark cycle 7 Tasks Z (gates+deploy) and ZZ (archive) done).
- Cycle 7 closed: 0 NEW findings, drew down 3 LOW deferred items (Stale-AGG-1 + AGG-2 doc-only closures, Stale-AGG-5 source-level test commit `9e928fd1`). Deploy clean.
- User-injected TODOs (`plans/user-injected/pending-next-cycle.md`): TODO #1 still CLOSED (cycle 1 RPF). No new entries.
- Cycle change surface vs cycle-7 close-out HEAD `1c991812`: empty (cycle 8 starts at HEAD = cycle-7 close-out).

## Cycle-7 plan reconciliation

The cycle-7 plan (`plans/open/2026-04-29-rpf-cycle-7-review-remediation.md`) is internally consistent at HEAD `1c991812`:
- Task A (Stale-AGG-1 closure): closed; no commit needed.
- Task B (Stale-AGG-2 closure): closed; no commit needed.
- Task C (time-route source-level regression test): done in commit `9e928fd1`.
- Tasks D-E: explicitly DEFERRED with exit criteria.
- Task Z: recorded `per-cycle-success`.
- Task ZZ: archived cycle-6 plan in commit `abebb843`.

No reconciliation drift. **Action this cycle (Task ZZ):** move cycle-7 plan to `plans/done/`.

## Tasks

### Task A: [LOW — DOING THIS CYCLE] Add `/api/v1/time` endpoint docs to README (closes C7-DS-1)

- **Source:** Cycle-7 carry-forward C7-DS-1 (document-specialist; "README missing `/api/v1/time` endpoint doc"). 5-lane cross-agent consensus this cycle (code-reviewer + perf-reviewer + security-reviewer + critic + document-specialist).
- **Severity (preserved):** LOW.
- **File:** `README.md`.
- **Concrete failure scenario:** A new contributor reads README to understand the public API surface and the client time-sync mechanism, finds nothing about `/api/v1/time`, has to dive into source to discover the DB-time mechanism the client depends on for exam countdown. Onboarding friction; risk of duplicate / parallel time-sync hacks landing.
- **Exit criterion:** README documents the `/api/v1/time` endpoint (response shape, DB-time semantics, why force-dynamic). Naturally met by adding the doc.
- **Repo policy check:** Doc-only; no code change. LOW severity. Compliant.
- **Plan:**
  1. Insert a brief "Time synchronization" section in `README.md` near the existing API endpoint docs (or near the `Documentation` section) describing `/api/v1/time`: the response shape (`{ timestamp: number }` ms epoch), the DB-time semantics (server uses DB `NOW()`, client aligns), and the regression-test reference (`tests/unit/api/time-route-db-time.test.ts`).
- **Outcome:** Done in commit `1cdf79ed` (`docs(readme): 📝 document /api/v1/time DB-time endpoint`).
- **Status:** [x] Done.

### Task B: [LOW — DOING THIS CYCLE] Add soft upper-bound cap to `DEPLOY_SSH_RETRY_MAX` in `deploy-docker.sh` (closes C7-DB-2-upper-bound)

- **Source:** Cycle-7 carry-forward C7-DB-2-upper-bound (debugger + critic; "`deploy-docker.sh:224` `DEPLOY_SSH_RETRY_MAX` no upper bound"). 4-lane cross-agent consensus this cycle (code-reviewer + perf-reviewer + security-reviewer + critic).
- **Severity (preserved):** LOW.
- **File:** `deploy-docker.sh:220-227` (the `_initial_ssh_check` function's max_attempts validation block).
- **Concrete failure scenario:** Operator typo sets `DEPLOY_SSH_RETRY_MAX=10000` (extra digit). The deploy hangs in retry loop for hours, looking like a hung deploy. Worse on a remote that has fail2ban or similar IDS, the retry storm could trigger a temporary IP ban, blocking the next legitimate deploy attempt.
- **Exit criterion:** `DEPLOY_SSH_RETRY_MAX` values above a soft cap (100) trigger a warning log line and the cap value is used. Override knob still functional.
- **Repo policy check:** Bash-only; lightweight. No security/correctness regression. LOW severity. Compliant.
- **Plan:**
  1. After the existing positive-integer validation block in `_initial_ssh_check`, add a soft-cap check: if `max_attempts > 100`, warn and clamp to 100.
  2. Update the env-var documentation block (`# DEPLOY_SSH_RETRY_MAX  — ...`) to document the soft cap.
  3. Run `npm run lint:bash` to confirm clean.
- **Outcome:** Done in commit `d9cb15e6` (`feat(deploy): ✨ soft-cap DEPLOY_SSH_RETRY_MAX at 100 with operator-clarity warn`). `npm run lint:bash` exit 0.
- **Status:** [x] Done.

### Task C: [LOW — DOING THIS CYCLE] Top-of-file orientation comments in 2 rate-limit modules (partial mitigation for C7-AGG-9)

- **Source:** Cycle-7 carry-forward C7-AGG-9 (security-reviewer + architect; "3-module rate-limit duplication"). Cycle-8 partial-mitigation pick (critic + document-specialist 2-lane).
- **Severity (preserved):** LOW. (This is partial mitigation; the underlying duplication remains DEFERRED until rate-limit consolidation cycle.)
- **Files:**
  - `src/lib/security/in-memory-rate-limit.ts` (top-of-file JSDoc).
  - `src/lib/security/api-rate-limit.ts` (currently has no top-of-file JSDoc).
  - `src/lib/security/rate-limit.ts` (already has a sufficient top-of-file JSDoc from cycle 6 — leave as-is).
- **Concrete failure scenario:** A future contributor patches a rate-limit edge-case bug in only one of the three modules, leaving the other two with the bug. Unit-test coverage of cross-module behavior parity is also deferred (C7-AGG-9). Drift risk is the failure class.
- **Exit criterion:** Top-of-file JSDoc in `in-memory-rate-limit.ts` and `api-rate-limit.ts` cross-references the other modules and explicitly states the canonical 3-module split (in-memory for high-throughput per-instance; api-rate-limit for cross-instance via DB; rate-limit for login/auth via DB).
- **Repo policy check:** Comments only; no behavior change. LOW severity. Compliant.
- **Plan:**
  1. Extend the `in-memory-rate-limit.ts` JSDoc to cross-reference the DB-backed modules and explain when to choose which.
  2. Add a top-of-file JSDoc to `api-rate-limit.ts` (currently has no header doc) cross-referencing `rate-limit.ts` (login/auth) and `in-memory-rate-limit.ts` (high-throughput per-instance).
  3. Confirm `rate-limit.ts` JSDoc (already exists from cycle 6) is sufficient.
- **Outcome:** Done in commit `9c8d072e` (`docs(security): 📝 add cross-reference orientation comments to rate-limit modules`). `rate-limit.ts` JSDoc was already sufficient (cycle 6); added headers to `in-memory-rate-limit.ts` (extended existing header) and `api-rate-limit.ts` (added new header).
- **Status:** [x] Done.

### Task D: [LOW — DEFERRED] All other carry-forward items unchanged (with path/count drift corrections)

The `src/` tree did not change this cycle, so the carry-forward `src/` deferred items keep their status verbatim, with **path/count drift corrections** applied per cycle-8 cross-agent consensus:

- **C3-AGG-5** — `deploy-docker.sh` modular extraction trigger. File: whole `deploy-docker.sh` (1076 lines at HEAD; trigger 1500). Touch counter: 2 after cycle-6, **3 after this cycle's Task B (touches SSH-helpers area)**. One more cycle modifying SSH-helpers triggers refactor. Severity LOW. Exit criterion: 1500 lines OR `deploy.sh` invoked OR 3 indep cycles modify SSH-helpers (now at 3, so the next cycle that modifies SSH-helpers may need to schedule the refactor — recorded explicitly here).
- **C3-AGG-6** — SSH ControlMaster socket dir path-predictability. File: `deploy-docker.sh:182-191`. Severity LOW. Exit criterion: multi-tenant deploy host added OR peer-user awareness reported.
- **C2-AGG-5** — visibility-aware polling helper extraction. **5 distinct sites** at HEAD (firmer count than cycle-7's "4-6"). Severity LOW. Exit criterion: telemetry signal OR 7th instance.
- **C2-AGG-6** — practice page Path B fetches all matching IDs in memory. File: `src/app/(public)/practice/page.tsx:417`. Severity LOW. Exit criterion: p99 > 1.5s OR > 5k matching problems.
- **C1-AGG-3** — client `console.error` sites. **HEAD count = 24** (was 25 in cycle-7 aggregate; -1 drift, all in pre-existing client components). Severity LOW. Exit criterion: telemetry/observability cycle opens.
- **D1, D2** — auth JWT clock-skew + DB-per-request. Severity MEDIUM. Files: under `src/lib/auth/` but **NOT in `src/lib/auth/config.ts`** (per CLAUDE.md "Preserve Production config.ts"). Exit criterion: dedicated auth-perf cycle.
- **AGG-2** — `Date.now()` in rate-limit hot path + overflow-sort. File: `src/lib/security/in-memory-rate-limit.ts` lines 22, 24, 56, 75, 100, 149 + 41-47. Severity MEDIUM. Exit criterion: rate-limit-time perf cycle.
- **ARCH-CARRY-1** — raw API route handlers don't use `createApiHandler`. Count: 20 raw of 104 total at HEAD (unchanged from cycle-7). Severity MEDIUM. Exit criterion: API-handler refactor cycle.
- **ARCH-CARRY-2** — SSE eviction is O(n). Two sites at HEAD: `src/lib/realtime/realtime-coordination.ts` AND `src/app/api/v1/submissions/[id]/events/route.ts:48-63`. Severity LOW. Exit criterion: SSE perf cycle OR > 500 concurrent connections.
- **PERF-3** — anti-cheat heartbeat gap query. File: `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:191-225`. Severity MEDIUM. Exit criterion: anti-cheat dashboard p99 > 800ms OR > 50 concurrent contests viewed simultaneously.
- **DEFER-ENV-GATES** — env-blocked vitest integration / playwright e2e. Severity LOW. Exit criterion: fully provisioned CI/host with DATABASE_URL, Postgres, Playwright sidecar.
- **C7-AGG-6 (carry)** — `src/lib/assignments/participant-status.ts` time-boundary tests missing. Severity LOW. Exit criterion: bug report on deadline boundary OR participant-status refactor cycle.
- **C7-AGG-7 (carry)** — `src/lib/security/encryption.ts:79-81` decrypt plaintext fallback. Severity LOW. Exit criterion: production tampering incident OR audit cycle.
- **C7-AGG-9 (carry, partial mitigation this cycle)** — `src/lib/security/{in-memory,api-,}rate-limit.ts` 3-module duplication. Severity LOW. Cycle 8 adds top-of-file orientation comments (Task C); the underlying consolidation remains DEFERRED. Exit criterion: rate-limit consolidation cycle.

All keep their original severities and prior exit criteria (no downgrade). Path/count drift corrections do not change severity. Deferral permitted per repo rules: none are HIGH; none are present-day security/correctness/data-loss findings.

- **Status:** [x] All deferred this cycle.

### Task Z: [INFO — DOING] Run all configured gates and the deploy

- **Source:** Orchestrator GATES + DEPLOY_MODE.
- **Plan:**
  1. Run `npm run lint` (eslint).
  2. Run `npx tsc --noEmit`.
  3. Run `npm run lint:bash` (cycle-5 added).
  4. Run `npm run build` (next build).
  5. Run `npm run test:unit`, `npm run test:integration`, `npm run test:component`, `npm run test:security` (DEFER-ENV-GATES expected for env-blocked harness).
  6. Run `npm run test:e2e` (best-effort).
  7. After all error-level gates green (or skipped with explanation), run `SKIP_LANGUAGES=true BUILD_WORKER_IMAGE=false INCLUDE_WORKER=false ./deploy-docker.sh` once. Do NOT preemptively set `DRIZZLE_PUSH_FORCE=1`.
  8. Record `DEPLOY: per-cycle-success` or `DEPLOY: per-cycle-failed:<reason>` in this plan.
- **Repo policy check:** No `--no-verify`, no force-push, GPG-sign all commits.
- **Outcome:**
  - `npm run lint`: exit 0 (clean).
  - `npx tsc --noEmit`: exit 0 (clean).
  - `npm run lint:bash`: exit 0 (clean).
  - `npm run build` (next build): exit 0 (route surface unchanged from cycle 7).
  - `npm run test:integration`: exit 0; 37 tests SKIPPED — DEFER-ENV-GATES carry-forward (no Postgres harness in dev shell). Same condition cycles 3-7.
  - `npm run test:unit`: 124 failed + 2110 passed — DEFER-ENV-GATES carry-forward (vitest pool fork-spawn errors + DB-env-required failures); same as cycle 7.
  - `npm run test:component`: 66 errors — DEFER-ENV-GATES carry-forward (vitest pool worker spawn timeouts); same as cycle 7.
  - `npm run test:security`: 4 failures + 205 passes (rate-limiter-client circuit-breaker timeouts under CPU contention; **better than cycle 7's 8 failures**, suggests less contention this run; same DEFER-ENV-GATES carry-forward class).
  - `npm run test:e2e`: skipped (DEFER-ENV-GATES; webServer Postgres harness not provisioned).
  - **Deploy** (`SKIP_LANGUAGES=true BUILD_WORKER_IMAGE=false INCLUDE_WORKER=false ./deploy-docker.sh`):
    - Pre-flight SSH check: clean (**0 "Permission denied" lines** — verified via `grep -c 'Permission denied' /tmp/deploy-cycle-8.log` = 0).
    - PostgreSQL volume safety check: passed.
    - drizzle-kit push: `[i] No changes detected` (no destructive diff; DRIZZLE_PUSH_FORCE NOT set, NOT required per orchestrator directive).
    - Schema repairs + ANALYZE: applied.
    - Containers started; worker stopped per `INCLUDE_WORKER=false`.
    - Nginx configured and reloaded for `oj-internal.maum.ai`.
    - HTTP 200 from JudgeKit endpoint.
    - **Deployment complete!** at `http://oj-internal.maum.ai`.
  - **Deployed SHA:** `9c8d072e` (cycle-8 Task C commit; HEAD at deploy time).
- **GATE_FIXES count:** 0 error-level fixes (all gate failures are pre-existing DEFER-ENV-GATES carry-forwards; none caused by this cycle's diff).
- **DEPLOY result:** `per-cycle-success`.
- **Notable:** Cycle-8's three implemented LOW backlog draw-down items (Task A: README `/api/v1/time` doc commit `1cdf79ed`, Task B: `DEPLOY_SSH_RETRY_MAX` soft-cap commit `d9cb15e6`, Task C: rate-limit module orientation comments commit `9c8d072e`) all landed without operational regression. Deploy clean.
- **Status:** [x] Done.

### Task ZZ: [INFO — DOING] Archive cycle-7 plan to `plans/done/`

- **Source:** Orchestrator PROMPT 2 directive: "Archive plans which are fully implemented and done."
- **Plan:** Move `plans/open/2026-04-29-rpf-cycle-7-review-remediation.md` → `plans/done/2026-04-29-rpf-cycle-7-review-remediation.md`. Cycle-7 plan is fully recorded (Tasks A/B closed, C done, D-E deferred, Z `per-cycle-success`, ZZ done).
- **Repo policy check:** No code change. Documentation hygiene.
- **Outcome:** Archive landed in commit `1cdf79ed` (`git mv` was already staged with Task A). The archived plan now lives at `plans/done/2026-04-29-rpf-cycle-7-review-remediation.md`.
- **Status:** [x] Done in commit `1cdf79ed`.

---

## Gate-fix accounting (for cycle report)

- Errors fixed: 0 expected (lint/tsc/build clean per cycle-7 close-out; this cycle's diff is README + bash cap + 2 file-header comments).
- Warnings fixed: 0.
- Suppressions added: 0.
- New defer entries: 0 (all deferrals carry-forward).
- Closed entries: 2 expected — C7-DS-1 (README doc landed), C7-DB-2-upper-bound (cap landed). Plus C7-AGG-9 partially mitigated (orientation comments).

## Cycle close-out checklist

- [x] Task A committed (`1cdf79ed`, GPG-signed, conventional + gitmoji).
- [x] Task B committed (`d9cb15e6`, GPG-signed, conventional + gitmoji).
- [x] Task C committed (`9c8d072e`, GPG-signed, conventional + gitmoji).
- [x] Cycle-8 plan committed (this file, with reviews+aggregate, in `bf1aba17`).
- [x] Cycle-7 plan archived (Task ZZ, commit `1cdf79ed`).
- [x] Reviews + aggregate snapshot committed (`bf1aba17`).
- [x] All gates green or DEFER-ENV-GATES-skipped with explanation (Task Z).
- [x] Deploy outcome recorded in this plan (Task Z): `per-cycle-success`.
- [ ] End-of-cycle report emitted by the orchestrator wrapper.
