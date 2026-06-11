# RPF Cycle 3 (2026-06-11) — Aggregate Review

**Date:** 2026-06-11
**HEAD reviewed:** 63429d97 (main) — cycle-2's completed tree, deployed and
healthy on all three targets (test.worv.ai / oj.auraedu.me / algo.xylolabs.com).
**Cycle:** 3/100 (orchestrator-numbered)
**Lenses:** 11 specialist + 6 persona files in this directory, all refreshed at
this HEAD (cycle-2 versions copied to `_archive/cycle-2-2026-06-11/`).
**Baseline gates on review HEAD (executed):** tsc 0 · eslint 0/0 ·
lint:bash clean · unit 333 files / 2579 tests PASS.

## AGENT FAILURES
None of the named reviewer subagents (code-reviewer, perf-reviewer, …) are
registered in this environment (no Agent tool is available to this cycle's
runner — same condition as cycles 1–2). Per the fan-out fallback, every lens
was executed directly by the cycle agent and written to its own file; no lens
was dropped. Recorded for provenance.

## Merged findings (deduped; severity/confidence preserved at max across lenses)

### AGG3-1 — Anti-cheat ingest ignores staff-extended personal deadlines (MEDIUM-HIGH, High, CONFIRMED)
**Lenses:** code-reviewer CR3-1, security-reviewer SEC3-1, verifier V3-2,
tracer Trace 1, debugger D3-1, critic §1, architect A3-1 (root cause),
test-engineer TE3-1, designer DES3-2, perspective-student ST3-1,
perspective-instructor IN3-1, perspective-assistant TA3-1,
perspective-job-applicant JA3-1, perspective-security §1,
perspective-admin AD3-3 — **15-lens agreement; highest signal this cycle.**
`src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:102-104` rejects
all events once `now > assignment.deadline`, while `extendExamSession`
(`src/lib/assignments/exam-sessions.ts:151`) deliberately moves
`exam_sessions.personal_deadline` past that close and
`validateAssignmentSubmission` (`src/lib/assignments/submissions.ts:259-271`)
honors it. Consequences: telemetry blackout during accommodation windows;
`submission_stale_heartbeat` escalate-tier FALSE flags per submission
(`submissions.ts:312-355`); heartbeat-gap reports paint the granted window as
suspicious; client retry churn. Fix: shared pure helper
`getEffectiveExamCloseAt(assignment, examSession)` (per A3-1) used by the
anti-cheat boundary check (one indexed lookup only on the past-deadline
branch); red-first tests per TE3-1 (extended→accepted, doubly-expired→403,
scheduled-mode unchanged, no false flag).

### AGG3-2 — `docs/exam-integrity-model.md` misstates the heartbeat gate as a hard block (MEDIUM, High, CONFIRMED)
**Lenses:** verifier V3-1, security-reviewer SEC3-2, document-specialist
DOC3-1 (+DOC3-2 extension paragraph), critic §2, code-reviewer CR3-3 (dead
union member), perspective-instructor IN3-2 — 6-lens agreement.
Doc line 55 claims 403 `antiCheatHeartbeatRequired`; code fails OPEN and flags
(`submissions.ts:328-355`); the error id survives only as a dead union member
(`submissions.ts:36`). Fix: rewrite the enforcement section to the fail-open +
flag posture incl. reviewer obligation; add the extensions paragraph (DOC3-2);
remove the dead union member.

### AGG3-3 — Remote smoke hero-heading expectation is not instance-brand-aware (LOW-MEDIUM, High, CONFIRMED — injected by cycle-2's deploy record)
**Lenses:** verifier V3-3, test-engineer TE3-2, perspective-admin AD3-1,
critic §3.
`tests/e2e/public-shell.spec.ts:13` and `tests/e2e/responsive-layout.spec.ts:81`
assert default-instance hero text; the h1 is config-driven
(`src/app/page.tsx:31,67` via `homePageContent`) — fails red on healthy
oj.auraedu.me. Fix: `E2E_HOME_HEADING` env-pattern override with current
default; document in spec headers.

### AGG3-4 — Exam-session GET poll wastes the staff-visibility resolution on every student poll (LOW-MEDIUM, High, CONFIRMED)
**Lenses:** perf-reviewer PERF3-1, code-reviewer CR3-4, test-engineer TE3-3.
`groups/[id]/assignments/[assignmentId]/exam-session/route.ts:112-116` —
resolve `canViewOthers` lazily (only when `?userId=` present and ≠ self);
~40 % of the new poll's query budget saved; semantics identical; pin with
tests per TE3-3.

### AGG3-5 — AntiCheatMonitor retries permanent 4xx rejections (LOW, High, CONFIRMED)
**Lenses:** code-reviewer CR3-2, perf-reviewer PERF3-2, tracer Trace 2,
debugger D3-2, architect A3-2.
`src/components/exam/anti-cheat-monitor.tsx:52-69` — tri-state send result;
drop 4xx (except 408/429) without queueing; keep retries for network/5xx/429.

### AGG3-6 — Backup restore-test undocumented (+role-mismatch false-negative caveat) (LOW, High, CONFIRMED)
**Lenses:** document-specialist DOC3-3, debugger D3-3, perspective-admin AD3-2.
`RESTORE_DATABASE_URL` referenced nowhere outside `scripts/verify-db-backup.sh`;
document in `docs/deployment.md` backup section (+runbook), incl. CREATE
DATABASE rights and the dump-owner role caveat.

### AGG3-7 — `run_remote_build` retry overwrites the first failure log (LOW, Medium, CONFIRMED)
**Lenses:** tracer Trace 3, debugger D3-4, critic §4.
Forensics-only impact (warn lines preserve the signature). Defer-eligible;
one-line fix if touched.

## Lens-local notes not merged into actionable findings
- architect A3-3 (SSH-helpers extraction trigger still TRIPPED, ~70 lines from
  the 1,500 size trigger) — register carry, unchanged obligation.
- critic §4 / architect A3-5 (deferred-register hop depth) — handled by this
  cycle's plan re-materializing the CARRY row.
- designer DES3-1 (assertive announcement on expired→extended) — cosmetic,
  defer-eligible.
- assistant TA3-1 follow-up candidate (render `exam_session.extend` audit in
  the participant timeline) — future-cycle candidate, recorded in the plan's
  deferred register.
- job-applicant JA-environment-clarity (language availability preview) — LOW
  carry, unchanged.

## Verified-sound this cycle (cross-lens, no action)
Rate-limit conflict-safe insert (all sites + tests); `run_remote_build`
pipeline-exit correctness under `set -euo pipefail`; CountdownTimer
expired→extended reset; ExamDeadlineSync mounting in the expired state;
sweepStaleWorkers idempotence; extension authz + durable audit + SQL
composition; ipOverlap gating/parameterization/index alignment; test-seed
production inertness; Korean letter-spacing policy compliance; en/ko parity
of new strings; data-retention doc accuracy incl. code_snapshots row.
