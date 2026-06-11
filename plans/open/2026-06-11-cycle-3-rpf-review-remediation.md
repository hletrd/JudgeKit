# Cycle 3 RPF review remediation (2026-06-11)

**Date:** 2026-06-11
**Cycle:** 3/100 of this RPF loop (orchestrator-numbered)
**HEAD at review:** 63429d97 (main) — cycle-2's completed tree, deployed and
healthy on all three targets.
**Aggregate:** `.context/reviews/_aggregate.md` (cycle-3; 11 specialist + 6
persona lenses, all refreshed at this HEAD; cycle-2 lens files archived to
`.context/reviews/_archive/cycle-2-2026-06-11/`).
**Baseline gates on review HEAD:** tsc 0 · eslint 0/0 · lint:bash clean ·
unit 333 files / 2579 tests PASS.
**Highest-severity item:** AGG3-1 (MEDIUM-HIGH, 15-lens agreement).

Status legend: ✅ done+pushed · 🔧 in progress · ⬜ todo · 🟡 needs decision

---

## Implement this cycle

### G1 ⬜ AGG3-1 — Anti-cheat ingest must honor staff-extended personal deadlines (MEDIUM-HIGH, High, CONFIRMED; 15-lens agreement)
`src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:102-104` rejects
all events once `now > assignment.deadline`, while
`extendExamSession` (`src/lib/assignments/exam-sessions.ts:151`) deliberately
moves `exam_sessions.personal_deadline` past the close and
`validateAssignmentSubmission` honors it (`submissions.ts:259-271`).
Consequences: telemetry blackout during accommodation windows; per-submission
`submission_stale_heartbeat` FALSE escalate flags (`submissions.ts:312-355`);
heartbeat-gap reports paint granted windows as suspicious.
Tasks:
- Extract a pure helper (architect A3-1): `getEffectiveExamCloseAt(
  assignment: {examMode, deadline}, personalDeadline: Date | null): Date | null`
  in `src/lib/assignments/` (DB-free; windowed + later personal deadline →
  personal deadline; otherwise assignment deadline).
- Anti-cheat POST: on the `now > assignment.deadline` branch ONLY (keeps the
  hot path at zero extra queries), for `examMode === "windowed"` fetch the
  caller's `exam_sessions.personal_deadline` and accept while
  `now <= effective close`. Scheduled mode and doubly-expired sessions keep
  the 403.
- Tests FIRST (TE3-1, red→green):
  (1) windowed past assignment close + future personal deadline → 200 + row
  inserted (heartbeat AND tab_switch);
  (2) personal deadline also past → 403 contestEnded;
  (3) scheduled mode past close → 403 unchanged;
  (4) helper unit tests (null deadlines, non-windowed, equal boundaries).
- Optional same-commit consistency: route `submissions.ts:259-271` through the
  same helper (behavior-identical refactor) so the contract has one owner.

### G2 ⬜ AGG3-2 — Make the integrity doc truthful about the fail-open heartbeat gate (MEDIUM, High, CONFIRMED)
- `docs/exam-integrity-model.md:55` region: rewrite "Submission-time heartbeat
  enforcement" to the actual fail-open + flag posture
  (`submission_stale_heartbeat`, escalate tier, reviewer obligation, fairness
  rationale per the code comment at `submissions.ts:328-335`). Correct the
  "What this closes" bullet (curl path is FLAGGED, not blocked).
- Add the extensions paragraph (DOC3-2): staff extensions move the
  per-participant window; telemetry + submission acceptance follow
  `personal_deadline` (true once G1 lands); durably audited
  (`exam_session.extend`).
- Remove the dead `"antiCheatHeartbeatRequired"` union member
  (`src/lib/assignments/submissions.ts:36`) — CR3-3.
- Land AFTER G1 so the doc describes the fixed system.

### G3 ⬜ AGG3-3 — Brand-aware remote smoke heading (LOW-MEDIUM, High, CONFIRMED; injected by cycle-2's deploy record)
- `tests/e2e/public-shell.spec.ts:13` and
  `tests/e2e/responsive-layout.spec.ts:81`: read
  `process.env.E2E_HOME_HEADING` (regex source, case-insensitive) with the
  current pattern as default; header comment documenting the knob and why
  (h1 is `homePageContent`-config-driven — `src/app/page.tsx:31,67`).
- Keep the assertion itself (visible h1 + no error shell still asserted).

### G4 ⬜ AGG3-4 — Lazy staff-visibility resolution in the exam-session GET poll (LOW-MEDIUM, High)
`src/app/api/v1/groups/[id]/assignments/[assignmentId]/exam-session/route.ts:112-116`:
only call `canViewAssignmentSubmissions` when `?userId=` is present and ≠
`user.id`; non-staff requesting others keep the silent self-fallback.
Tests (TE3-3): student no-param poll never invokes the resolver (mock
assertion); staff cross-read still works; non-staff cross-read still
self-falls-back.

### G5 ⬜ AGG3-5 — Tri-state anti-cheat send result; stop retrying permanent 4xx (LOW, High)
`src/components/exam/anti-cheat-monitor.tsx:52-69`: `sendEvent` returns
`"ok" | "permanent" | "retry"` — `res.ok` → ok; 4xx except 408/429 →
permanent (drop, never queue); network error / 5xx / 408 / 429 → retry
(current queue+backoff semantics). `reportEvent` and `performFlush` drop
permanent failures. Component tests: 403 not queued; 500 queued+retried;
existing retry tests stay green.

### G6 ⬜ AGG3-6 — Document the backup restore-test (LOW, High)
`docs/deployment.md` (backup section, ~:379) + runbook: `RESTORE_DATABASE_URL`
(base DSN, CREATE DATABASE rights), what the full restore-test proves vs the
gzip-only check, the dump-owner role caveat (D3-3 — `ON_ERROR_STOP` +
ownership statements can false-fail on mismatched scratch instances), and the
skip-notice meaning.

---

## Deferred register (cycle-3) — findings NOT implemented this cycle
Severity preserved; no security/correctness/data-loss finding is deferred
(AGG3-1/2 are scheduled above as G1/G2).

| ID | Finding (file+line) | Sev/Conf | Reason for deferral | Exit criterion |
|---|---|---|---|---|
| AGG3-7 | `deploy-docker.sh` `run_remote_build`: retry `tee`s into the same `$out_file`, overwriting the first failure log (forensics only; warn lines preserve the signature) | LOW/Medium | Touching the deploy script mid-cycle for a forensics nicety is riskier than the gain; no operator impact on triage | Next cycle that edits `run_remote_build` adds `${out_file}.retry`; or an incident where the first log was needed |
| DES3-1 | `exam-deadline-sync.tsx:107` — expired→active transition announced politely, not assertively | LOW(cosmetic)/Medium | a11y polish needing UX judgement (assertive announcements are disruptive if overused); current role=status note is compliant | Bundle with the next exam-page a11y pass |
| TA3-1-followup | Render `exam_session.extend` audit events in the participant timeline so TAs can self-serve "this gap was a granted extension" | LOW(product)/High | New feature surface (timeline rendering), not a defect fix; G1 removes the false flags themselves | Owner schedules timeline enrichment; bundle with TA2 |
| JA-clarity | No pre-test language-availability preview for candidates | LOW/Medium | Product decision carried from earlier cycles, unchanged | Owner decision on candidate-facing test-info page |

### CARRY register (re-materialized from cycle-2 per architect A3-5; origin: `plans/done/2026-06-11-cycle-1-rpf-review-remediation.md` + cycle-2 plan)
| ID | Item | Status |
|---|---|---|
| C3-AGG-5 | deploy-docker.sh SSH-helpers extraction — trigger TRIPPED; size trigger 1500 lines (now ~1430). Any cycle touching SSH/remote-exec plumbing must extract first | unchanged |
| IN2-2 | Pre-start accommodations / per-student duration overrides (product decision; workaround: extend after start) | owner decision pending |
| DEFER-ENV-GATES | E2E for login-gated/user-facing features (incl. G5-E2E deadline-sync, DES-ENV browser a11y audit) — no provisioned test server/browser from this env | provisioned staging server |
| D1, D3, D4, CR2/P2, P3, T4, IN3/JA2, TA1, TA2, TR2, TH1, ST2, PS2, ARCH-CARRY-1/2, DOC-C5-2, C7-DS-1, N7-C7, C7-AGG-9, AGG2-8a | As recorded at origin (cycle-1 register, severities preserved there) | unchanged preconditions |

Deferred work remains bound by repo policy when picked up (GPG-signed
conventional+gitmoji commits, no `--no-verify`, no force-push, tests per
AGENTS.md).

## Plan archival done in this planning pass
- `plans/open/2026-06-11-cycle-2-rpf-review-remediation.md` → `plans/done/`
  (all G1–G7 ✅ done+pushed; deploy exit criterion met — recorded in its
  completion section; deferred rows re-materialized into the CARRY register
  above per the RPF per-cycle plan convention in `plans/open/README.md`).
- Standing plans (`2026-04-14-master-review-backlog.md`,
  `2026-04-17-*`, `2026-05-*` lanes) remain open — not cycle-scoped.

## Recommended sequence
1. G1 (tests first; the cycle's principal fix) → G2 (doc truth, after G1).
2. G4 (poll trim) → G5 (client tri-state).
3. G3 (smoke brand-awareness) → G6 (backup docs).
Gates after each item; fine-grained signed commits; pull --rebase + push per
iteration; then DEPLOY_CMD (per-cycle mode, detached + polled).

---

## Completion record (to fill during implementation)
- G1 ⬜ · G2 ⬜ · G3 ⬜ · G4 ⬜ · G5 ⬜ · G6 ⬜
- Final gates: ⬜
- Deploy: ⬜
