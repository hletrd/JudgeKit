# Cycle 2 RPF review remediation (2026-06-11)

**Date:** 2026-06-11
**Cycle:** 2/100 of this RPF loop (orchestrator-numbered)
**HEAD at review:** 4cf01035 (main) — cycle-1's completed tree, deployed and
healthy on all three targets.
**Aggregate:** `.context/reviews/_aggregate.md` (cycle-2; 11 specialist + 6
persona lenses, all refreshed at this HEAD).
**Baseline gates on review HEAD:** tsc 0 · eslint 0/0 · lint:bash clean ·
unit 332 files / 2571 tests PASS.
**Highest-severity item:** AGG2-2 (HIGH, ops — injected DEFERRED-OPS-1
closure). Code findings top out at MEDIUM.

Status legend: ✅ done+pushed · 🔧 in progress · ⬜ todo · 🟡 needs decision

---

## Implement this cycle

### G1 ⬜ AGG2-2 — Close DEFERRED-OPS-1: harden deploy-docker.sh against BuildKit history corruption (HIGH ops; injected TODO — MUST land BEFORE this cycle's deploy)
CONFIRMED diagnosis (auraedu, Docker 29.1.3 / buildx v0.20.0, verified by the
orchestrator): `failed to solve: Internal: unknown blob sha256:... in
history` lives in the BuildKit HISTORY store. `docker builder prune -af`
does NOT clear it; `docker buildx history rm --all` does (metadata-only,
zero downtime). Re-triggered by the one-shot ~90-target parallel
`docker compose build` (`deploy-docker.sh:651-656`) on a cold cache
(history/GC race — two consecutive full-parallel runs corrupted fresh
history stores: judge-powershell, then judge-lua). Working remedy used to
reach 4cf01035 on auraedu+algo: clear history, then build sequentially via
the existing per-language loop (`LANGUAGE_FILTER=all`).
Tasks:
- (a) **All-languages path**: stop using the unbounded parallel bake.
  Default the no-filter path to the sequential per-language loop (reuse
  `resolve_languages all`), and/or export `COMPOSE_PARALLEL_LIMIT`
  (operator-overridable env, conservative default) if the compose path is
  kept as an opt-in (`LANGUAGE_BUILD_STRATEGY=compose`).
- (b) **Auto-recovery**: wrap the remote build invocations (app image,
  worker image, sidecars, per-language builds, compose path if kept) so
  that when the build output matches `unknown blob .* in history`, the
  script runs `docker buildx history rm --all` on that remote host and
  retries the failed step exactly once. Log loudly (warn + signature) so
  the operator sees the self-heal. No other failure signatures trigger it.
- (c) **Docs**: add the failure signature + confirmed remedy + non-remedy
  (`builder prune -af` insufficient) + re-trigger mechanism to AGENTS.md
  "Deploy hardening" (AGENTS.md:396) and the ops runbook, including the
  CLAUDE.md guardrail reminder (never `docker image prune -a` on worker
  hosts).
- (d) **Register**: record the DEFERRED-OPS-1 resolution in this plan
  (below) — diagnosis confirmed, hardening shipped, exit criterion met when
  this cycle's three-target deploy passes through the hardened path.
- Tests: `npm run lint:bash` (bash -n) green; unit-test the new
  signature-matching helper if extracted into a testable form (a grep-able
  pattern constant is acceptable with a shell syntax check otherwise).
- NOTE (C3-AGG-5 obligation): these edits touch the language-build step,
  NOT the SSH-helpers area; the tripped SSH-helpers extraction trigger is
  re-documented in the deferred register below, unchanged.

### G2 ⬜ AGG2-1 — code_snapshots: language gate + retention (MEDIUM, 8-lens agreement)
- `src/app/api/v1/code-snapshots/route.ts`: gate `body.language` on
  `isJudgeLanguage` → 400 `languageNotSupported` (mirror submit route :207
  and cycle-1 F2 draft gate). Non-breaking: the only client
  (`problem-submission-form.tsx:158`) sends registry languages.
- `src/lib/data-retention.ts`: add `codeSnapshots: 180` default (aligned
  with `antiCheatEvents` — snapshots are anti-cheat telemetry and must not
  outlive the derived signals), env override `CODE_SNAPSHOT_RETENTION_DAYS`.
- `src/lib/data-retention-maintenance.ts`: `pruneCodeSnapshots` keyed on
  `createdAt` (append-only table; `cs_created_at_idx` exists), added to the
  allSettled set; update the "Seven independent prunes" docstring → eight.
- `docs/data-retention-policy.md`: add the code_snapshots row (what, why,
  window, override, deletion key).
- Tests FIRST: route 400-junk-language + happy path; prune log assertion +
  defaults pinned (mirror the cycle-1 F2 test shapes).

### G3 ⬜ AGG2-5 — Retention-coverage class-closer test (MEDIUM leverage)
New structural unit test (tests/unit/infra/): walk the exported pgTable
definitions in `src/lib/db/schema.pg.ts` and assert every table that is
user-row-growing + timestamped is either (a) covered by a prune in
`data-retention-maintenance.ts` / `DATA_RETENTION_DAYS`, or (b) on an
explicit in-test allowlist with a one-line justification (users, problems,
groups, system_settings, …). Must fail before G2 lands (red→green) and the
allowlist must be exact (walker-sanity assertion to prevent vacuous pass,
per the F5 precedent).

### G4 ⬜ AGG2-3 — Rate-limit first-insert race → 500 (LOW-MEDIUM correctness in a security control)
- Add conflict-safe insert in the shared core where possible (architect
  A2-3: keeps C7-AGG-9 consolidation debt flat):
  `insert(...).onConflictDoNothing({ target: rateLimits.key })`; when the
  insert reports 0 rows, re-read via `fetchRateLimitEntry` (row now exists,
  FOR UPDATE locks it) and fall through to the existing update path.
- Apply at all four sites: `api-rate-limit.ts` atomicConsumeRateLimit
  (:84-92), consumeUserDailyQuota (:244-252), checkServerActionRateLimit
  (:353-361), and `rate-limit-core.ts` upsertRateLimitEntry insert branch
  (:96-104) — preserving each consumer's window/backoff semantics exactly.
- Tests: structural assertions that the insert path is conflict-safe and
  that the conflict branch yields a non-throwing allowed/limited verdict
  (mock-level); extend the existing rate-limit unit suites.

### G5 ⬜ AGG2-4 — Live personal-deadline refresh for windowed exams (LOW-MEDIUM, 7-lens agreement; completes F12)
- Client: in the windowed-exam student view
  (`groups/[id]/assignments/[assignmentId]/page.tsx:196-201` renders
  `CountdownTimer`), re-fetch the exam session (existing GET
  `/api/v1/groups/[id]/assignments/[assignmentId]/exam-session`) on a
  ≥60 s interval AND on `visibilitychange`; when the returned
  `personalDeadline` is LATER than the current target, update the countdown
  and show a `role="status"` note "your deadline was extended" (en+ko).
  Never move the deadline EARLIER from a refetch (extension-only contract).
- Implementation shape: a small client component (e.g.
  `ExamDeadlineSync` wrapping/augmenting CountdownTimer for the windowed
  branch only) or an opt-in `refreshUrl` prop on CountdownTimer — keep the
  scheduled/non-exam branches untouched.
- Tests: hook/component unit tests — refetch on interval +
  visibilitychange, later-deadline updates target + fires the status note,
  earlier/equal deadline is ignored, no refetch storm (interval ≥ 30 s).
  E2E: deferred to DEFER-ENV-GATES (no provisioned test server in this
  env) — record below.

### G6 ⬜ AGG2-6 — ExamExtendDialog polish (LOW)
`exam-extend-dialog.tsx`: `inputMode="numeric"` on the minutes input; add a
Cancel button to the footer; submit on Enter via a form element (match
score-override-dialog conventions). Keep strings in both locales. Component
test updated.

### G7 ⬜ AGG2-7 — Review-artifact archive sweep (LOW housekeeping)
Move pre-2026-06 review files from `.context/reviews/` root into
`.context/reviews/_archive/` (git mv; no deletions), leaving the current
cycle's 18 files + `_archive/` + the dated subdirectories. Update nothing
else; this is file moves only.

---

## DEFERRED-OPS-1 resolution record (closes the cycle-1 register entry)
- **Origin:** cycle-1 plan `plans/done/2026-06-11-cycle-1-rpf-review-remediation.md`
  (recorded HIGH/ops after the auraedu deploy failure at 5e14fdf9).
- **Confirmed diagnosis (orchestrator, on-host):** BuildKit history-store
  corruption; signature `unknown blob sha256:... in history`;
  `docker buildx history rm --all` clears it (metadata-only);
  `docker builder prune -af` does NOT; re-triggered by the full-parallel
  compose bake of ~90 language targets on cold cache; sequential
  per-language builds complete cleanly.
- **Interim remedy already executed:** history cleared + sequential builds →
  auraedu and algo deployed at 4cf01035 (all three targets healthy).
- **Permanent fix:** G1 above (serialize/cap + auto-recovery + runbook).
- **Exit criterion:** this cycle's three-target DEPLOY_CMD completes through
  the hardened script. → record outcome in the completion section below.

## Deferred register (cycle-2) — findings NOT implemented this cycle
Severity preserved; no security/correctness/data-loss finding is deferred
(AGG2-1/2/3 are all scheduled above as G2/G1/G4).

| ID | Finding (file+line) | Sev/Conf | Reason for deferral | Exit criterion |
|---|---|---|---|---|
| AGG2-8a | `drizzle/pg/meta/_journal.json` missing trailing newline | INFO | Not worth a standalone commit; journal files are tool-managed | Bundle with the next journaled migration |
| IN2-2 | No pre-start accommodation grant (extend requires an existing session), status-board.tsx extend gating | LOW/Medium (product) | Needs a product decision (per-student duration override at roster level); correct workaround exists (extend after start) | Owner schedules accommodations feature; bundle with TA2 |
| CARRY | D1, D3, D4, CR2/P2, P3, T4, IN3/JA2, TA1, TA2, TR2, TH1, DES-ENV, ST2 (pair with G5 follow-up), PS2, ARCH-CARRY-1, ARCH-CARRY-2, C3-AGG-5 (SSH-helpers extraction trigger still TRIPPED; G1 touches the build step, not SSH helpers — obligation unchanged; file ~1335 lines, size trigger 1500 not yet hit), DOC-C5-2, C7-DS-1, N7-C7, C7-AGG-9 (G4 deliberately lands in the shared core to avoid widening this), DEFER-ENV-GATES | as recorded | Carried from the cycle-1 register with unchanged preconditions (see `plans/done/2026-06-11-cycle-1-rpf-review-remediation.md`) | As recorded at origin |
| G5-E2E | E2E coverage for the live deadline refresh (AGENTS.md requires E2E for user-facing features) | LOW/env-bound | DEFER-ENV-GATES precedent: no provisioned test server reachable from this environment; unit/component layers land with G5 | Provisioned staging/test server; add to remoteSafe/e2e suite |

Deferred work remains bound by repo policy when picked up (GPG-signed
conventional+gitmoji commits, no `--no-verify`, tests per AGENTS.md).

## Plan archival done in this planning pass
- `plans/open/2026-06-11-cycle-1-rpf-review-remediation.md` → `plans/done/`
  (all 13 items ✅ done+pushed and re-verified from code by this cycle's
  verifier pass — see `.context/reviews/verifier.md`; its deploy follow-up
  DEFERRED-OPS-1 is closed by G1 above; its deferral register is carried
  verbatim into the CARRY row above).

## Recommended sequence
1. G1 (deploy hardening — unblocks and protects this cycle's deploy).
2. G2+G3 (snapshots fix + class-closer, tests first; one commit each).
3. G4 (rate-limit core).
4. G5 (deadline refresh) → G6 (dialog polish).
5. G7 (archive sweep).
Gates after each item; fine-grained signed commits; pull --rebase + push per
iteration; then DEPLOY_CMD (per-cycle mode).

---

## Completion record (fill during implementation)
- G1 ⬜ · G2 ⬜ · G3 ⬜ · G4 ⬜ · G5 ⬜ · G6 ⬜ · G7 ⬜
- Gates: ⬜ tsc · ⬜ eslint · ⬜ lint:bash · ⬜ unit · ⬜ build
- Deploy: ⬜ worv · ⬜ auraedu · ⬜ algo
