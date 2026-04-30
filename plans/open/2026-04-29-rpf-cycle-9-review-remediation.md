# RPF Cycle 9 Review Remediation Plan (orchestrator-driven, 2026-04-29)

**Date:** 2026-04-29
**Source:** `.context/reviews/_aggregate.md` (RPF cycle 9 orchestrator-driven) + `plans/user-injected/pending-next-cycle.md`
**Status:** OPEN

---

## Cycle prologue

- HEAD at start of cycle: `1bcdd485` (cycle-8 close-out: docs(plans) ✅ mark cycle 8 Tasks A/B/C/Z/ZZ done with deploy outcome).
- Cycle 8 closed: 0 NEW findings, drew down 3 LOW deferred items (C7-DS-1 README `/api/v1/time` doc; C7-DB-2-upper-bound `DEPLOY_SSH_RETRY_MAX` cap; C7-AGG-9 partial mitigation rate-limit orientation comments). Deploy clean (`per-cycle-success`).
- User-injected TODOs (`plans/user-injected/pending-next-cycle.md`): TODO #1 still CLOSED (cycle 1 RPF). No new entries.
- Cycle change surface vs cycle-7 close `1c991812`: 5 commits, 18 files, +823/-86 lines. Code/script touches: `README.md` (+10), `deploy-docker.sh` (+11/-3), 2 rate-limit JSDoc headers (+26 doc-only).

## Cycle-8 plan reconciliation

The cycle-8 plan (`plans/open/2026-04-29-rpf-cycle-8-review-remediation.md`) is internally consistent at HEAD `1bcdd485`:
- Task A (C7-DS-1 README `/api/v1/time` doc): done in commit `1cdf79ed`.
- Task B (C7-DB-2-upper-bound `DEPLOY_SSH_RETRY_MAX` cap): done in commit `d9cb15e6`.
- Task C (C7-AGG-9 partial mitigation rate-limit orientation comments): done in commit `9c8d072e`.
- Task D: explicit DEFERRALS recorded with original severity preserved.
- Task Z: recorded `per-cycle-success`.
- Task ZZ: archived cycle-7 plan in commit `1cdf79ed`.

No reconciliation drift. **Action this cycle (Task ZZ):** move cycle-8 plan to `plans/done/`.

## Tasks

### Task A: [LOW — DOING THIS CYCLE] Trigger-trip record for C3-AGG-5 deploy-docker.sh refactor (LOW-DS-3)

- **Source:** Cycle-9 critic + architect + document-specialist 3-lane consensus (LOW-DS-3 in document-specialist file). Carry-forward C3-AGG-5 trigger met (3 indep cycles modifying SSH-helpers area: cycles 5, 6, 8).
- **Severity (preserved):** LOW.
- **File:** `deploy-docker.sh` (top-of-file comment block).
- **Concrete failure scenario:** A future cycle (10, 11, ...) modifies `_initial_ssh_check` (e.g., adds another env knob, tweaks the backoff schedule, adjusts the warn line) without recognizing that C3-AGG-5's exit criterion ("3 indep cycles modify SSH-helpers") has already been met as of cycle 8. The refactor trigger is silently bypassed; the file continues to grow without modular extraction. Cycle plan files document the trip but the file head does not, so a contributor working from the source alone misses it.
- **Exit criterion:** A top-of-file comment in `deploy-docker.sh` near the existing env-var documentation block notes that the SSH-helpers refactor trigger (C3-AGG-5) has been tripped (touch counter reached 3 after cycle 8) and that the next SSH-helpers modification should schedule the modular extraction.
- **Repo policy check:** Comments only; no behavior change. LOW severity. Compliant.
- **Plan:**
  1. Add a comment block near the head of `deploy-docker.sh` (right after the existing "Deploy hardening" doc block, ≤8 lines) noting:
     - SSH-helpers refactor trigger (C3-AGG-5) has been tripped as of cycle 8 (touch counter = 3).
     - Next modification to `_initial_ssh_check` / `_run_remote` / similar SSH helpers MUST schedule the modular extraction or document the deferral with a fresh exit criterion.
     - Cross-reference: cycle-8 plan, cycle-9 plan, `_aggregate.md` carry-forward registry.
  2. Run `npm run lint:bash` and `git diff` to confirm the comment block is syntactically clean (no broken bash continuations).
- **Status:** [ ] Pending.

### Task B: [LOW — DOING THIS CYCLE] Document `npm run lint:bash` in README (LOW-DS-1)

- **Source:** Cycle-9 document-specialist + critic 2-lane consensus (LOW-DS-1).
- **Severity (preserved):** LOW.
- **File:** `README.md`.
- **Concrete failure scenario:** Cycle-5 added the `lint:bash` npm script (commit `08991d54`) to lint `deploy-docker.sh` + `deploy.sh` via `bash -n`. The README's development/CI documentation does not list this script. A contributor edits `deploy-docker.sh`, runs `npm run lint` (which only runs eslint and is clean), pushes, and learns from the cycle gate run that the parallel bash linter exists. Onboarding friction.
- **Exit criterion:** README documents `npm run lint:bash` alongside `lint`/`tsc`/`build` in the development workflow section.
- **Repo policy check:** Doc-only. LOW severity. Compliant.
- **Plan:**
  1. Add a brief mention of `npm run lint:bash` to the README near the existing build/lint/tsc references (≤6 lines). Note that it covers `deploy-docker.sh` and `deploy.sh` (the two bash files lint:bash actually checks per `package.json`).
- **Status:** [ ] Pending.

### Task C: [LOW — DOING THIS CYCLE] Top-of-file warning comment for plaintext-fallback in encryption.ts (C7-AGG-7 partial mitigation)

- **Source:** Cycle-9 critic + security-reviewer 2-lane consensus (C7-AGG-7 carry).
- **Severity (preserved):** LOW.
- **File:** `src/lib/security/encryption.ts` (top-of-file).
- **Concrete failure scenario:** `encryption.ts` has a function-level JSDoc on `decrypt()` (lines 60-77) describing the plaintext fallback. However, there is no module-level JSDoc summarizing the fallback's risk profile, audit-trail expectation (production warn-log), or the deferral exit criterion for hard removal. A contributor scanning the file head for orientation does not see the security caveat; they may copy the fallback pattern into a new module without recognizing the audit risk.
- **Exit criterion:** Top-of-file JSDoc in `encryption.ts` summarizes (a) the AES-256-GCM scheme, (b) the `enc:` prefix invariant for ciphertext, (c) the plaintext-fallback path's risk profile and the production warn-log, and (d) the C7-AGG-7 deferral exit criterion ("production tampering incident OR audit cycle").
- **Repo policy check:** Doc-only. LOW severity. Compliant.
- **Plan:**
  1. Insert a top-of-file JSDoc block (~10-15 lines) before the imports in `src/lib/security/encryption.ts`. Describe the encryption scheme, the `enc:` prefix invariant, the plaintext-fallback path risk profile, the production warn-log, and the C7-AGG-7 deferral.
  2. Run `npx tsc --noEmit` to confirm no TS issues.
  3. Run `npm run lint` to confirm clean.
- **Status:** [ ] Pending.

### Task D: [LOW — DEFERRED] All other carry-forward items unchanged (with path/count drift corrections)

The `src/` tree did not change this cycle (other than Task C's doc-only JSDoc), so the carry-forward `src/` deferred items keep their status verbatim:

- **C3-AGG-5** — `deploy-docker.sh` modular extraction. **Trigger threshold met** as of cycle 8 (touch counter = 3 after cycles 5, 6, 8). Cycle 9 records the trigger trip (Task A) but does not yet execute the modular extraction (architect recommends a dedicated next cycle for the actual refactor). Severity LOW. Exit criterion: modular extraction scheduled for dedicated next cycle (recommended) OR `deploy-docker.sh` >1500 lines OR `deploy.sh` invoked.
- **C3-AGG-6** — SSH ControlMaster socket dir path-predictability. File: `deploy-docker.sh:182-191`. Severity LOW. Exit criterion: multi-tenant deploy host added OR peer-user awareness reported.
- **C2-AGG-5** — visibility-aware polling helper extraction. **5 distinct sites at HEAD** (unchanged). Severity LOW. Exit criterion: telemetry signal OR 7th instance.
- **C2-AGG-6** — practice page Path B fetches all matching IDs in memory. File: `src/app/(public)/practice/page.tsx:417`. Severity LOW. Exit criterion: p99 > 1.5s OR > 5k matching problems.
- **C1-AGG-3** — client `console.error` sites. **HEAD count = 24** (unchanged). Severity LOW. Exit criterion: telemetry/observability cycle opens.
- **D1, D2** — auth JWT clock-skew + DB-per-request. Severity MEDIUM. Files: under `src/lib/auth/` but **NOT in `src/lib/auth/config.ts`** (per CLAUDE.md "Preserve Production config.ts"). Exit criterion: dedicated auth-perf cycle.
- **AGG-2** — `Date.now()` in rate-limit hot path + overflow-sort. File: `src/lib/security/in-memory-rate-limit.ts` lines 22, 24, 56, 75, 100, 149 + 41-47. Severity MEDIUM. Exit criterion: rate-limit-time perf cycle.
- **ARCH-CARRY-1** — raw API route handlers don't use `createApiHandler`. Count: 20 raw of 104 total at HEAD (unchanged). Severity MEDIUM. Exit criterion: API-handler refactor cycle.
- **ARCH-CARRY-2** — SSE eviction is O(n). Two sites at HEAD: `src/lib/realtime/realtime-coordination.ts` AND `src/app/api/v1/submissions/[id]/events/route.ts:48-63`. Severity LOW. Exit criterion: SSE perf cycle OR > 500 concurrent connections.
- **PERF-3** — anti-cheat heartbeat gap query. File: `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:191-225`. Severity MEDIUM. Exit criterion: anti-cheat dashboard p99 > 800ms OR > 50 concurrent contests viewed simultaneously.
- **DEFER-ENV-GATES** — env-blocked vitest integration / playwright e2e. Severity LOW. Exit criterion: fully provisioned CI/host with DATABASE_URL, Postgres, Playwright sidecar.
- **C7-AGG-6 (carry)** — `src/lib/assignments/participant-status.ts` time-boundary tests missing. Severity LOW. Exit criterion: bug report on deadline boundary OR participant-status refactor cycle.
- **C7-AGG-7 (carry, partial mitigation this cycle)** — `src/lib/security/encryption.ts:79-81` decrypt plaintext fallback. Severity LOW. Cycle 9 adds top-of-file warning comment (Task C); the underlying hard-removal remains DEFERRED. Exit criterion: production tampering incident OR audit cycle.
- **C7-AGG-9 (carry, partial mitigation cycle 8)** — `src/lib/security/{in-memory,api-,}rate-limit.ts` 3-module duplication. Severity LOW. Cycle 8 added orientation comments (commit `9c8d072e`); the underlying consolidation remains DEFERRED. Exit criterion: rate-limit consolidation cycle.

All keep their original severities and prior exit criteria (no downgrade). Path/count drift corrections do not change severity. Deferral permitted per repo rules: none are HIGH; none are present-day security/correctness/data-loss findings.

- **Status:** [ ] All deferred this cycle.

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
- **Status:** [ ] Pending.

### Task ZZ: [INFO — DOING] Archive cycle-8 plan to `plans/done/`

- **Source:** Orchestrator PROMPT 2 directive: "Archive plans which are fully implemented and done."
- **Plan:** Move `plans/open/2026-04-29-rpf-cycle-8-review-remediation.md` → `plans/done/2026-04-29-rpf-cycle-8-review-remediation.md`. Cycle-8 plan is fully recorded (Tasks A/B/C done, D deferred, Z `per-cycle-success`, ZZ done).
- **Repo policy check:** No code change. Documentation hygiene.
- **Status:** [ ] Pending.

---

## Gate-fix accounting (for cycle report)

- Errors fixed: 0 expected (lint/tsc/build clean per cycle-8 close-out; this cycle's diff is `deploy-docker.sh` head comment + README + encryption.ts head JSDoc).
- Warnings fixed: 0.
- Suppressions added: 0.
- New defer entries: 0 (all deferrals carry-forward; LOW-DS-1 / LOW-DS-3 are picked this cycle, not deferred).
- Closed entries: 2 expected — LOW-DS-1 (README lint:bash doc), LOW-DS-3 (deploy-docker.sh trigger-trip record). Plus C7-AGG-7 partially mitigated (encryption.ts head warning).

## Cycle close-out checklist

- [ ] Task A committed (GPG-signed, conventional + gitmoji).
- [ ] Task B committed (GPG-signed, conventional + gitmoji).
- [ ] Task C committed (GPG-signed, conventional + gitmoji).
- [ ] Cycle-9 plan committed (this file, with reviews+aggregate).
- [ ] Cycle-8 plan archived (Task ZZ).
- [ ] Reviews + aggregate snapshot committed.
- [ ] All gates green or DEFER-ENV-GATES-skipped with explanation (Task Z).
- [ ] Deploy outcome recorded in this plan (Task Z).
- [ ] End-of-cycle report emitted by the orchestrator wrapper.
