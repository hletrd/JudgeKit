# RPF Cycle 2 (2026-06-11) — Aggregate Review

**Date:** 2026-06-11
**HEAD reviewed:** 4cf01035 (main) — i.e. cycle-1's completed tree, deployed
and healthy on all three targets.
**Cycle:** 2/100 (orchestrator-numbered)
**Lenses:** 11 specialist + 6 persona files in this directory, all refreshed
for this HEAD (cycle-1 versions overwritten per run rules).
**Baseline gates on review HEAD (executed):** tsc 0 · eslint 0/0 ·
lint:bash clean · unit 332 files / 2571 tests PASS.

## AGENT FAILURES
None of the named reviewer subagents (code-reviewer, perf-reviewer, …) are
registered in this environment (no Agent tool is available to this cycle's
runner). Per the fan-out fallback, every lens was executed directly by the
cycle agent and written to its own file; no lens was dropped. Recorded here
for provenance.

## Merged findings (deduped; severity/confidence preserved at max across lenses)

### AGG2-1 — `code_snapshots`: no retention + unvalidated unbounded `language` (MEDIUM, High, CONFIRMED)
**Lenses:** code-reviewer CR2-1, security-reviewer SEC2-1+SEC2-2, perf
PERF2-1, document-specialist DOC2-1/3, critic #1, perspective-student,
perspective-admin AD2-2, perspective-security §4 — 8-lens agreement (highest
signal this cycle).
`src/app/api/v1/code-snapshots/route.ts:14-19` (no `isJudgeLanguage` gate, no
max length on `language`); `src/lib/data-retention.ts` (no key);
`src/lib/data-retention-maintenance.ts:135-140` (not pruned);
`docs/data-retention-policy.md` (no row). Highest-volume sensitive table
(≤256 KiB row / ~10 s per active examinee) outlives the 180 d anti-cheat
events derived from it. Fix: registry-gate language (mirror draft route F2),
add `codeSnapshots: 180` retention (env `CODE_SNAPSHOT_RETENTION_DAYS`),
prune on `createdAt` (index `cs_created_at_idx` exists), policy-doc row,
docstring count 7→8, tests.

### AGG2-2 — DEFERRED-OPS-1: deploy BuildKit history corruption — CONFIRMED diagnosis, harden deploy-docker.sh (HIGH ops, CONFIRMED — injected TODO)
**Lenses:** security-reviewer SEC2-4, tracer Trace 1, architect A2-2,
document-specialist DOC2-2, critic #3, perspective-admin AD2-1,
perspective-security §6.
Diagnosis (verified on auraedu, Docker 29.1.3/buildx 0.20.0): "Internal:
unknown blob … in history" lives in the BuildKit HISTORY store; `docker
builder prune -af` does NOT clear it; `docker buildx history rm --all` does
(metadata-only). Re-triggered by the ~90-target parallel compose bake
(`deploy-docker.sh:651-656`); sequential `LANGUAGE_FILTER=all` loop is the
working remedy (how 4cf01035 reached auraedu+algo). Hardening (BEFORE this
cycle's deploy): (a) cap parallelism / fall back to the sequential loop in
the all-languages path; (b) auto-recovery — detect the signature in build
output → `docker buildx history rm --all` on the remote → retry the step
once; (c) document signature+remedy in AGENTS.md deploy-hardening + runbook;
(d) close DEFERRED-OPS-1 in plans with this resolution.

### AGG2-3 — Rate-limit first-insert race → user-visible 500 (LOW-MEDIUM, Medium on frequency / High on mechanism, CONFIRMED)
**Lenses:** code-reviewer CR2-2, debugger D2-1, tracer Trace 3, security
SEC2-3, perf PERF2-3, perspective-security §6.
`src/lib/security/api-rate-limit.ts:84-92, 244-252, 353-361` +
`src/lib/security/rate-limit-core.ts:96-104`: bare INSERT after a FOR
UPDATE that locked nothing → unique violation → 500. Fix:
`onConflictDoNothing({ target: rateLimits.key })`; on 0-row insert, re-read
(row exists now) and take the update path. Apply in the shared core where
possible (keeps C7-AGG-9 consolidation debt flat) + structural test.

### AGG2-4 — Staff-granted exam extension invisible to the participant until reload (LOW-MEDIUM, High, CONFIRMED)
**Lenses:** verifier V2-1, tracer Trace 4, debugger D2-2, designer DES2-1,
perspective-student ST2-NEW-1, perspective-instructor IN2-1,
perspective-job-applicant JA2-1 — 7-lens agreement.
`src/app/(public)/groups/[id]/assignments/[assignmentId]/page.tsx:168-201`:
countdown deadline + `isExamExpired` are render-time snapshots; the
session GET (`exam-session/route.ts:93`) already exists. Fix: client-side
periodic + visibilitychange refetch of the personal deadline for windowed
exams; extend the countdown live and show a `role="status"` "deadline
extended" note (en+ko). Completes F12's accommodation story.

### AGG2-5 — Retention-coverage class-closer test (MEDIUM leverage, test gap)
**Lenses:** critic #1, test-engineer T2-2. Structural unit test: every
user-writable timestamped table in schema.pg.ts is either retention-pruned
or on a documented allowlist — prevents the next "we forgot table X"
(this cycle: snapshots; last cycle: drafts).

### AGG2-6 — ExamExtendDialog polish (LOW, High)
**Lenses:** code-reviewer CR2-3, designer DES2-2. `inputMode="numeric"`,
Cancel button, Enter-submit via form; optionally ≥24 px trigger target.

### AGG2-7 — Review/plan artifact sprawl (LOW, housekeeping)
**Lenses:** critic #4, perspective-admin AD2-3. Sweep pre-2026-06 review
files from `.context/reviews/` root into `_archive/`.

### AGG2-8 — INFO items
- `drizzle/pg/meta/_journal.json` missing trailing newline (CR2-4) — bundle
  with next journaled migration.
- IN2-2 pre-start accommodation grants (product note → register, with TA2).

## Verified-good at HEAD (explicit, to prevent re-flagging)
All 13 cycle-1 fixes re-verified from code (see verifier.md table): F1 claim
accounting sound (LIMIT 1 + all requeue paths null judgeWorkerId); F3 scope
filters are problems-only; F12 cannot leak past-close to unextended
participants (start clamps to deadline); `namedToPositional` dedupes repeated
params; `recordAuditEventDurable` never throws; new endpoints' authz gates
correct; i18n parity holds; no Korean tracking utilities introduced.

## Carried register (unchanged preconditions — origin: cycle-1 plan deferral table)
D1 (reclaim deadlock, self-recovering) · D3 (registration clock-skew) ·
D4 (pre-hydration keystrokes) · CR2/P2 (claim-route scoringModel SELECT) ·
P3 (draft write load) · T4 (backup restore-test CI) · IN3/JA2 (judging-delay
banner) · TA1 (TA exam-content separation) · TA2 (per-assignment TA grading;
now bundled with IN2-2) · TR2 (per-assignment AI override) · TH1 (pino test
noise) · DES-ENV (live browser pass) · ST2 (expired-editor state; pair with
AGG2-4) · PS2 (fullscreen posture) · ARCH-CARRY-1/2 · C3-AGG-5
(deploy-docker.sh SSH-helpers extraction — trigger still TRIPPED; this
cycle's build-step edits do not touch SSH helpers; file now ~1335 lines) ·
DOC-C5-2 · C7-DS-1 · N7-C7 · DEFER-ENV-GATES.

## Recommended implementation order (cycle 2)
1. AGG2-2 deploy hardening (must precede DEPLOY_CMD).
2. AGG2-1 snapshots (gate + retention + docs, tests first).
3. AGG2-5 class-closer test (lands naturally with AGG2-1).
4. AGG2-3 rate-limit race (shared core + tests).
5. AGG2-4 live deadline refresh (+ ST2-adjacent status note).
6. AGG2-6 dialog polish · AGG2-7 archive sweep.
