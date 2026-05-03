# RPF Loop Cycle 4 — Review Remediation Plan (2026-05-03)

**HEAD at planning time:** `7a195b11` (main, post-cycle-3 close-out)
**Source aggregate:** `.context/reviews/_aggregate.md` (cycle 4, also
preserved at `.context/reviews/_aggregate-cycle-4.md`).
**User-injected TODOs:** ingested from
`./user-injected/pending-next-cycle.md` and
`./plans/user-injected/pending-next-cycle.md`. Both files list **(none
at the moment)** for active items; the workspace-to-public migration
TODO is "DONE 2026-04-29 (cycle 1 RPF)" and the comprehensive UI/UX
review with playwright + agent-browser is recorded as
"Artifact delivered for RPF cycle 55 / loop cycle 3/100" with a
runtime-env precondition for re-running. Nothing new to ingest this
cycle.

## Repo policy compliance (read at planning time)

- `CLAUDE.md` (project): preserve `src/lib/auth/config.ts` as-is on
  deploy; deploy-mode this cycle is `none`, no concern. Korean
  letter-spacing rule: do not apply `tracking-*` to Korean text — none
  of the cycle-4 fixes touch Korean text.
- `~/.claude/CLAUDE.md` (global): GPG-sign every commit, conventional
  commit + gitmoji, fine-grained commits, pull --rebase before push,
  no Co-Authored-By, latest-stable language/framework versions.
- `AGENTS.md`: documentation-source-of-truth for the 125 language
  list; no language config changes this cycle.

## Done criteria (cycle-level)

- CYC4-AGG-1, CYC4-AGG-2, CYC4-AGG-3, CYC4-AGG-4 implemented (all 4
  are LOW — none deferrable since none have a "trigger not met"
  exit criterion blocking action this cycle and all are cheap to
  land).
- All gates green: `npm run lint`, `npm run lint:bash`, `npm run
  test:unit`, `npm run test:security`, `npm run build`.
- E2E gate attempted; if env-blocked recorded as DEFER-ENV-GATES.

---

## TASKS

### TASK-1 [CYC4-AGG-1, LOW]: Archive stale prior-loop cycle-11 plan

- **File to move:** `plans/open/2026-04-29-rpf-cycle-11-review-remediation.md`
- **Destination:** `plans/closed/2026-04-29-rpf-cycle-11-review-remediation.md`
- **Why closed/, not done/:** the file references prior-loop HEAD
  `7073809b` no longer reachable from `main`. Treating it as "closed"
  (superseded) rather than "done" (this loop completed it) is the
  honest framing.
- **Header to prepend:** A 1-paragraph note at the top:
  ```
  # SUPERSEDED (prior RPF loop, archived 2026-05-03)
  # This plan is from a prior RPF loop (loop cycle 11/100, HEAD
  # `7073809b`, no longer reachable from `main`). The current loop
  # (cycles 1-4 at HEAD `7a195b11`) supersedes its task list. Kept
  # for historical provenance only.
  ```
- **Status:** [x] Done

### TASK-2 [CYC4-AGG-2, LOW]: Add field-level JSDoc + Map widening contract note to recruit-results helper

- **File to edit:** `src/lib/assignments/recruiting-results.ts`
- **Change 1 (interface field JSDoc):** Add inline JSDoc to each field
  of `RecruitProblemRow` and `RecruitBestSubmission` describing the
  field's source DB column and unit (e.g., percentage 0-100 vs.
  per-problem points).
- **Change 2 (function-level contract note):** Append to the
  `computeRecruitResultsTotals` JSDoc:
  ```
   * @remarks
   * The helper reads only `points` from `RecruitProblemRow` and only
   * `score` from `RecruitBestSubmission`. Callers may pass wider Map
   * values (e.g., the page passes a Map of full submission rows that
   * structurally fit `RecruitBestSubmission` because each row has a
   * `score: number | null` field). If a future helper change reads
   * additional fields, callers MUST narrow the input Map to ensure
   * the new fields are populated — TypeScript structural width-
   * subtyping silently accepts wider Maps and would otherwise hide a
   * missing-field regression.
  ```
- **Status:** [x] Done

### TASK-3 [CYC4-AGG-3, LOW]: Add legal-hold test for `pruneSensitiveOperationalData`

- **File to edit:** `tests/unit/data-retention-maintenance.test.ts`
- **Approach:** Mock `@/lib/data-retention` to set
  `DATA_RETENTION_LEGAL_HOLD = true` and assert (a) `db.execute` is
  NEVER called, (b) the legal-hold info-log is emitted.
- **Implementation note:** The current test file mocks
  `@/lib/db`, `@/lib/db/schema`, `@/lib/logger`, `@/lib/db-time`, and
  `drizzle-orm`. We need to ALSO mock `@/lib/data-retention` to flip
  `DATA_RETENTION_LEGAL_HOLD`. Use `vi.doMock` after `vi.resetModules`
  in the new test so the override only applies to that test.
- **Test scenarios (1):**
  1. With `DATA_RETENTION_LEGAL_HOLD = true`,
     `pruneSensitiveOperationalData` (driven via
     `startSensitiveDataPruning`) does NOT call `db.execute` and emits
     the legal-hold info-log line.
- **Status:** [x] Done

### TASK-4 [CYC4-AGG-4, LOW]: Document mtime-resolution assumption in snapshot retention test

- **File to edit:** `tests/unit/db/pre-restore-snapshot.test.ts`
- **Change:** Add an inline comment near `setTimeout(r, 5)` (line 124)
  explaining the sub-second-mtime assumption:
  ```
  // The 5ms inter-snapshot sleep assumes the underlying filesystem
  // has sub-second mtime resolution (macOS APFS, Linux ext4/btrfs/
  // zfs, modern Docker volumes — all satisfy this). On older NFS or
  // FAT32 with second-resolution mtime, this test could flake by
  // keeping 4 or 6 files instead of 5. CI runs on Ubuntu containers
  // with sub-second mtime; if a future CI changes to a slower-mtime
  // backend, sort by ISO stamp embedded in the filename instead.
  ```
- **Status:** [x] Done

### TASK-5 [Gates] Run all configured gates

Per orchestrator PROMPT 3:
- `npm run lint` — error-blocking; warnings best-effort.
- `npm run lint:bash` — error-blocking.
- `npm run test:unit` — error-blocking.
- `npm run test:security` — error-blocking.
- `npm run build` — error-blocking.
- `npm run test:e2e` — best-effort; env-blocked → DEFER-ENV-GATES.

- **Status:** [x] Done

---

## DEFERRED items (severity preserved, exit criterion stated)

The following findings are **explicitly deferred this cycle** with
severity preserved and an exit criterion stated. None are HIGH. None
are security/correctness/data-loss-blocking. Deferral rationale is
rooted in repo policy (small, fine-grained commits per global
CLAUDE.md; no force-driven progress where the change surface would
crowd out verification).

| ID | Severity | File+line | Reason for deferral | Exit criterion |
|----|----------|-----------|---------------------|----------------|
| CR4-3 | LOW | `data-retention-maintenance.test.ts` `vi.resetModules()` comment | Polish; CYC4-AGG-3 already adds a legal-hold test that exercises module isolation | A future test cross-pollution bug |
| CR4-2 | LOW | `pre-restore-snapshot.test.ts` mtime resolution | Covered by CYC4-AGG-4 inline comment in TASK-4 | Test flake on a slow-mtime backend |
| TE4-1 | LOW | recruit-results page-level integration test | Playwright env-blocked under DEFER-ENV-GATES | E2E env unblock |
| TE4-2 | LOW | `pre-restore-snapshot.test.ts` chmod-fail case | Polish; chmod failure is best-effort with warn-log already in source | Operator log signal |
| TE4-3 | LOW | tie-breaking case for recruit-results | Page-level concern (helper sees the resulting Map), not helper-level | If tie-breaking logic moves into the helper |
| TR4-1 | LOW | `bestByProblem` pair-with-helper extraction | Architectural taste; not a defect | Next recruit-results touch with reduction logic change |
| TR4-2 | LOW | snapshot stat-failure operator runbook entry | Operator-runbook concern, not source | Operator-runbook cycle |
| DBG4-1 | LOW | helper duplicate-problemId validation | Latent; DB constraints prevent today | Future caller without DB-level uniqueness |
| DBG4-2 | LOW | snapshot stat() race with concurrent prune | Race window microseconds, observation honest | No exit (no-action) |
| DS4-1 | LOW | SECURITY.md test-link sentence | Polish; existing section is accurate | Doc-tooling cycle |
| DS4-3 | LOW | source comment test-file path | Polish; ID-only citation is grep-able | Consistency cycle |
| ARCH4-2 | LOW | ops/maintenance module hierarchy | Slow-growth; only 2 ops files today | 3+ ops files OR new ops file |
| PERF4-1 | LOW | snapshot retention test setTimeout cumulative cost | Cumulative cost is 35ms; not a real perf trap | A future test that copies the pattern many times |
| PERF4-2 | LOW | Map pre-allocation | JS engine limitation | None (engine-side) |
| SR4-1 | LOW | snapshot filename actor-id slice | Carry-forward SEC2-2 | Multi-tenant deploy or leak report |
| SR4-2 | LOW | retention test `Date.now()` capture timing | Defensive polish; no current test asserts cutoff math | A future test asserting cutoff math against fake clock |
| V4-1 | LOW | retention test argument-shape assertion | Defensive polish; call-count assertion sufficient today | Theoretical regression that drops a prune helper |
| DSGN4-1 | LOW | per-problem rows render with no submission | Carry-forward DSGN3-2 | UX cycle |
| DSGN4-2 | LOW | 0-problems empty-state | Carry-forward DSGN3-1 | Recruiter UI removes 0-problem-submit guard OR operator reports |
| (all carry-forwards from cycle 3 aggregate) | -- | unchanged | (see _aggregate.md table) | -- |

No HIGH findings deferred. No security/correctness/data-loss
findings deferred unjustifiably. CYC4-AGG-1 through CYC4-AGG-4 are
**scheduled** in TASKS 1-4, not deferred.

---

## Repo policy compliance summary (for the deferred section above)

Per CLAUDE.md / AGENTS.md / ~/.claude/CLAUDE.md:
- All deferred items, when picked up later, must follow the same
  conventional-commit + gitmoji + GPG-signed protocol.
- No `--no-verify` / `--no-gpg-sign` / `eslint-disable` /
  `@ts-ignore` is authorised by the repo rules. None of the
  deferred items would require such a suppression to land.
- The Korean letter-spacing rule in `CLAUDE.md` does not apply to
  any cycle-4 task (no Korean text touched).

---

## Implementation order for PROMPT 3

The 4 active tasks (TASK-1 through TASK-4) are independent. Order
chosen to minimise verification overhead between commits:

1. TASK-1 (archive stale plan) — file move + header prepend; touches
   only `plans/`, no source impact, no need to re-run gates.
2. TASK-4 (snapshot test mtime comment) — single comment add; runs
   only test file lint.
3. TASK-2 (helper JSDoc) — single source file, JSDoc only, fast lint.
4. TASK-3 (legal-hold test) — test file extension + module mocking;
   needs `npm run test:unit` re-run to verify.
5. TASK-5 (full gate run + outcome record).

Each task that mutates code will be followed by a fresh gate run
before the next commit (unit + lint) to confirm no regression.

---

## Status

- [x] All 4 implementation tasks
- [x] All gates green
- [x] Plan archived to `plans/done/` after close-out

## Cycle close-out evidence

- Commits landed this cycle (against pre-cycle HEAD `7a195b11`):
  - `(docs commit)` docs(plans): add RPF loop cycle 4 reviews, aggregate, and remediation plan
  - `1f0fa33f` docs(plans): mark stale cycle-11 plan superseded by current loop (TASK-1 / CYC4-AGG-1)
  - `223bb524` test(restore): document mtime-resolution assumption in snapshot retention test (TASK-4 / CYC4-AGG-4)
  - `44665aba` docs(recruit): pin recruit-results helper field contract + Map widening note (TASK-2 / CYC4-AGG-2)
  - `7ed66ac2` test(retention): pin DATA_RETENTION_LEGAL_HOLD short-circuit contract (TASK-3 / CYC4-AGG-3)
  - `c7f1ff1b` test(restore): widen snapshot-retention sleep from 5ms to 25ms (GATE_FIX — full-suite parallel scheduler flake)
- Gate run at HEAD post-cycle:
  - `npm run lint` — exit 0
  - `npm run lint:bash` — exit 0
  - `npx tsc --noEmit` — exit 0
  - `npm run test:unit` — 307 files / **2257 tests passed** (+1 new vs cycle-3 close-out's 2256)
  - `npm run test:security` — 11 files / 195 tests passed
  - `npm run build` — exit 0 (next build succeeded)
  - `npm run test:e2e` — env-blocked, deferred under DEFER-ENV-GATES
- Deploy: `none` per orchestrator directive (DEPLOY_MODE=none).
- GATE_FIX details: cycle-3 test pattern (5ms inter-snapshot sleep)
  flaked under the full-suite parallel scheduler. Widened to 25ms;
  precise GATE_FIX context recorded in the test inline comment and
  in commit `c7f1ff1b` body.
