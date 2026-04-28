# RPF Cycle 1 Review Remediation Plan (orchestrator-driven, 2026-04-29)

**Date:** 2026-04-29
**Source:** `.context/reviews/_aggregate.md` (RPF cycle 1 orchestrator-driven) + `plans/user-injected/pending-next-cycle.md`
**Status:** IN PROGRESS

---

## Tasks

### Task A: [LOW] Add eslint config overrides for root `*.mjs` and `.context/tmp/**`

- **Source:** C1-AGG-1 (C1-CR-1)
- **Files:**
  - `eslint.config.mjs` — extend `globalIgnores` (lines 81-94) to include root `*.mjs` files, `.context/tmp/**`, and `playwright.visual.config.ts`
- **Fix:**
  1. Add the following entries to `globalIgnores` in `eslint.config.mjs`:
     - `"add-stress-tests.mjs"`, `"auto-solver.mjs"`, `"dedup-problems.mjs"`, `"fetch-problems.mjs"`, `"gen_test_cases.mjs"`, `"solve-all.mjs"`, `"solve-all2.mjs"`, `"solve-fixes.mjs"`, `"solve-problems.mjs"`, `"stress-tests.mjs"`, `"submit.mjs"`, `"verify-problems.mjs"` (or use a glob `"./*.mjs"` if eslint-config-next supports it)
     - `".context/**"`
     - `"playwright.visual.config.ts"` (or override `no-unused-vars` for it)
  2. Verify `npm run lint` produces 0 warnings post-change (or at least 0 from these files).
- **Exit criteria:** `npm run lint` shows 0 warnings (or warnings only in legitimate src files, none of which exist now).
- [ ] Done

### Task B: [LOW] Add gitignore patterns for untracked scratch scripts

- **Source:** C1-AGG-2 (C1-CR-2)
- **Files:** `.gitignore` (currently 32 lines, see HEAD).
- **Fix:**
  1. Append a section like:
     ```
     # one-off problem-solving scripts (workspace artefacts)
     /add-stress-tests.mjs
     /auto-solver.mjs
     /dedup-problems.mjs
     /fetch-problems.mjs
     /gen_test_cases.mjs
     /solutions.js
     /solve-all.mjs
     /solve-all2.mjs
     /solve-fixes.mjs
     /solve-problems.mjs
     /stress-tests.mjs
     /submit.mjs
     /verify-problems.mjs
     /verify_all_tc.py
     /verify_tc.py
     /scripts/fix-copyright.mjs
     /scripts/validate-enhance-201-300.mjs
     /scripts/validate-enhance-basic.mjs
     ```
     to `.gitignore`.
  2. Verify `git status --short` no longer reports them.
- **Exit criteria:** `git status --short` shows only `plans/user-injected/` (which is the orchestrator's working directory and intentionally tracked).
- [ ] Done

### Task C: [LOW — DEFERRED] Replace 27 client-side `console.error` calls with a `clientLogger` wrapper

- **Source:** C1-AGG-3 (C1-CR-3)
- **Severity (preserved):** LOW
- **Reason for deferral:** Out of scope for cycle 1 — every existing `console.error` call uses an explicit, descriptive label (e.g., `"Discussion post creation failed:"`). They are bounded contexts; no PII / token leakage observed. Adding a wrapper requires designing a `clientLogger` API surface that ties into telemetry, which is a separate planning effort.
- **Exit criterion:** Telemetry/observability cycle is opened (e.g., when an OTel/Sentry integration plan is drafted) — at that point, replace `console.error` with the new wrapper repo-wide.
- **Repo policy check:** Not security/correctness/data-loss; LOW severity; deferral is permitted. No security rule blocks deferral here.
- [ ] Deferred to telemetry-integration cycle (no exit criteria met yet)

### Task D: [LOW — DEFERRED] Pause polling intervals when document is hidden

- **Source:** C1-AGG-4 (C1-PR-1)
- **Severity (preserved):** LOW
- **Reason for deferral:** Not a regression; bounded by per-page mount/unmount. Optimization candidate once usage telemetry shows it matters. Implementing now without metrics risks premature optimization that could hide stale-data bugs in real-time leaderboards.
- **Exit criterion:** A concrete telemetry signal (real-user p99 CPU usage on judge platform > X% with multiple background tabs) or a user-reported battery drain.
- **Repo policy check:** Not security/correctness/data-loss; LOW severity; deferral permitted.
- [ ] Deferred to perf-telemetry cycle

### Task E: [LOW] Run `npm run test:e2e` best-effort and record outcome

- **Source:** C1-AGG-5 (C1-TE-2)
- **Plan:** PROMPT 3 will run `npm run test:e2e` and capture exit/error. If browsers genuinely unavailable on this host (no `playwright install` previously run), record as a deferred warning per cycle policy with the exit criterion of "playwright browsers installed in CI/host". If browsers are available and tests fail, treat as gate failure and root-cause.
- **Exit criteria:** Either (a) e2e exits 0, or (b) deferral note added with original severity LOW and concrete reason.
- [ ] Pending PROMPT 3

### Task F: [INFO] Archive workspace→public migration plan to `plans/archive/`

- **Source:** User-injected TODO #1 (verbatim done criterion: "(workspace) removed or empty, every non-admin dashboard page either migrated or explicitly listed as 'stays' with a quoted reason, build+typecheck+lint+unit/playwright green, migration plan archived").
- **Verification evidence (collected this cycle):**
  - `find src/app/'(workspace)' -type f` → empty.
  - `find src/app/'(control)' -type f` → empty.
  - `next.config.ts:20-52` declares 7 permanent (308) redirects covering `/workspace`, `/workspace/discussions`, `/dashboard/rankings`, `/dashboard/languages`, `/dashboard/compiler`, `/control`, `/control/discussions`.
  - Remaining `(dashboard)` routes (`dashboard/`, `dashboard/admin/*`, `dashboard/contests`, `dashboard/groups`, `dashboard/problem-sets`, `dashboard/problems`, `dashboard/profile`) all appear in the migration plan's Phase 4 audit "must stay in authenticated area" list with documented reasons.
  - `grep -rln "WorkspaceNav\|ControlNav\|workspaceShell\|controlShell" src/` → empty.
  - `npx tsc --noEmit`: exit 0. `npm run lint`: 0 errors.
- **Plan:**
  1. Update Phase 3 header from "IN PROGRESS" to "COMPLETE" with cycle reference. (DONE in this commit.)
  2. Update plan header `**Status:**` line to "ALL PHASES COMPLETE — ready for archival". (DONE.)
  3. Run gates (`npm run build`, `npm run test:unit`, `npm run test:integration`, `npm run test:component`, `npm run test:security`, `npm run test:e2e`).
  4. After all error-level gates pass, move `plans/open/2026-04-19-workspace-to-public-migration.md` → `plans/archive/2026-04-29-archived-workspace-to-public-migration.md` with a one-line closure note appended.
  5. Remove TODO #1 from `plans/user-injected/pending-next-cycle.md` (or strike through with cycle reference).
- **Exit criteria:** Migration plan moved to `plans/archive/`. TODO #1 cleared from `pending-next-cycle.md`. Closure commit lands with a clear conventional-commit message.
- [ ] Done after gate verification (PROMPT 3)

### Task G: Track all gate fixes in this cycle

- **Source:** Cycle policy (orchestrator gate spec).
- **Plan:** PROMPT 3 runs each gate listed in `GATES`. Errors blocking, warnings best-effort. Count error-level fixes + warning fixes for `GATE_FIXES`.
- **Expected scope:** Cycle 11 archive committed at HEAD; cycle 12 has no pre-existing red gates. Expected fixes: 14 lint warnings → 0 (Task A) = 14 warning fixes.
- [ ] Pending PROMPT 3

---

## Deferred-fix register

| ID | Severity | File+Line | Reason | Exit criterion | Repo rule check |
| --- | --- | --- | --- | --- | --- |
| C1-AGG-3 | LOW | 27 client `console.error` sites in `src/` | Telemetry wrapper requires separate API design; not a regression. | Telemetry/observability cycle opens. | Not security/correctness/data-loss; LOW; deferral permitted by general repo policy. |
| C1-AGG-4 | LOW | Polling sites in submission-status, leaderboard, exam-timer | Premature optimization without metrics; bounded by mount/unmount. | Real-user CPU/battery telemetry signal. | Not security/correctness/data-loss; LOW; deferral permitted. |

No HIGH/MEDIUM findings deferred. No security/correctness findings deferred. All deferrals are LOW severity with explicit exit criteria, in compliance with the orchestrator's strict deferred-fix rules.

---

## Cycle-1 commit plan

Each fix lands as a separate fine-grained, GPG-signed commit:

1. `chore(eslint): 🔧 ignore root *.mjs scratch scripts and .context/tmp` — Task A.
2. `chore(gitignore): 🙈 ignore one-off problem-solving scripts` — Task B.
3. `docs(plans): 📝 mark workspace migration plan ALL PHASES COMPLETE (cycle 1 RPF)` — Task F preparatory edit (already landed via this plan write).
4. `docs(plans): 🗂️ archive workspace-to-public migration (gate-verified ready)` — Task F archival, lands AFTER gates green.
5. `docs(plans): 📝 add cycle 1 RPF review remediation plan` — this plan file itself.
6. `docs(plans): ✅ clear TODO #1 from user-injected pending list` — after archival.

If gates require fixes, additional commits follow per fix.
