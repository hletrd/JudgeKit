# Cycle 1 RPF review remediation (2026-06-11)

**Date:** 2026-06-11
**Cycle:** 1/100 of this RPF loop (orchestrator-numbered)
**HEAD at review:** f977ef4c (main)
**Aggregate:** `.context/reviews/_aggregate.md` (17 lenses: 11 specialist + 6 persona)
**Baseline gates on review HEAD:** tsc 0 · eslint 0/0 · lint:bash clean · unit 330 files / 2551 tests PASS.
**No HIGH finding this cycle.** Top items are MEDIUM.

Status legend: ✅ done+pushed · 🔧 in progress · ⬜ todo · 🟡 needs decision

---

## Implement this cycle

### F1 ✅ AGG-1 — Fix self-reclaim `active_tasks` leak (MEDIUM; 4 lenses + 2 personas)
**Done 2026-06-11:** worker_bump now compensates the self-reclaim case
(`active_tasks + 1 - COUNT(candidate where previous_worker_id = @workerId)`);
`<> @workerId` guard kept on prev_worker_release with invariant + lock-order
comments. Structural unit test added AND the same-worker integration case was
**executed against a real throwaway Postgres 17** (not just env-gated): 5/5
reclaim tests + full DB integration suite 42/42 pass.
`src/lib/judge/claim-query.ts:80-101`. Same-worker stale reclaim bumps
`active_tasks` without releasing the prior hold → permanent +1 on a live worker.
- Compensate in `worker_bump`: `active_tasks = active_tasks + 1 - (self-reclaim count)`
  via `(SELECT COUNT(*) FROM candidate c WHERE c.previous_worker_id = @workerId AND EXISTS (SELECT 1 FROM claimed))`
  — keeps the `<> @workerId` guard on `prev_worker_release` (required: Postgres
  forbids two modifying CTEs updating one row).
- Add invariant comments (why `<>` must stay; lock-order rationale) per architect A3.
- Tests FIRST (red→green, test-engineer T1): structural assertion in
  `tests/unit/judge/claim-query.test.ts` that worker_bump compensates the self
  case; extend `tests/integration/db/judge-claim-reclaim.test.ts` with a
  same-worker reclaim case (net active_tasks unchanged) — env-gated like its
  siblings.

### F2 ✅ AGG-2 — Draft route language validation + retention (MEDIUM)
**Done 2026-06-11:** PUT gated on `isJudgeLanguage` (mirrors submit route;
DELETE deliberately permissive for cleanup of pre-gate rows); `sourceDrafts`
added to DATA_RETENTION_DAYS (180 d, `SOURCE_DRAFT_RETENTION_DAYS` override)
and to the pruning allSettled set keyed on updatedAt; policy doc updated
(+ fixed two stale rows found en route: chat default is 5 y in code not 30 d,
login events row was missing). Tests: 400 junk-language + happy case, prune
log assertion, defaults pinned. 27/27 relevant tests + tsc green.
- `src/app/api/v1/problems/[id]/draft/route.ts`: validate `language` against
  the judge language registry in PUT (400 `validation` on unknown); DELETE may
  stay permissive (deleting junk is harmless) — decide in implementation.
- Add `source_drafts` pruning to `src/lib/data-retention-maintenance.ts`
  (retention window env-configurable, default e.g. 180 days since `updatedAt`).
- Doc: add drafts line to `docs/data-retention-policy.md`.
- Tests: 400 unknown-language case + happy case (T2); retention prune test.

### F3 ✅ AGG-3 + AGG-11c — Stable problem numbering without full-catalog scan (MEDIUM)
**Done 2026-06-11:** new `src/lib/problems/catalog-numbers.ts`
(`getCatalogNumbersForIds`: row_number() window in a CTE, outer-filtered to the
page's ids — transfers ≤ PAGE_SIZE rows; lazy db import keeps it collection-safe
for env-gated tests). Both pages migrated; the redundant users-join dropped.
Ranking semantics (NULLS LAST, createdAt tiebreak, scope exclusion, pagination
stability, empty short-circuit) verified by a NEW integration test executed
against a real Postgres 17. Per-viewer numbering hint added to the /problems
number column header (title + sr-only, en+ko). Unit suite 2559/2559 green.
`src/app/(public)/problems/page.tsx:469-482`, `src/app/(public)/practice/page.tsx:538-549`.
- Replace whole-catalog id fetch with SQL `row_number() OVER (ORDER BY
  sequence_number ASC NULLS LAST, created_at ASC)` subquery filtered to the
  current page's ids (≤ PAGE_SIZE rows transferred).
- Dedupe the ordering expression (now in 4 places) into one helper.
- UX hint (AGG-11c): title/tooltip on the number column on `/problems`
  noting numbering reflects the viewer's visible catalog (en+ko).
- Tests: numbering helper unit test pinning rank semantics.

### F4 ✅ AGG-4 — Document NODE_ENCRYPTION_KEY (MEDIUM, docs)
**Done 2026-06-11:** added to `.env.example`, `.env.production.example`,
`docs/deployment.md` (quick-start block + required-env table), each explicitly
distinguishing it from `PLUGIN_CONFIG_ENCRYPTION_KEY`.

### F5 ✅ AGG-7 — CSP route→matcher guard test (LOW→MEDIUM trend, class-closer)
**Done 2026-06-11:** `tests/unit/infra/csp-matcher-coverage.test.ts` walks
`src/app/**/page.tsx` (route groups stripped) and asserts every top-level
segment maps into `config.matcher`; 404/unmatched-path exception documented
in-test; walker-sanity assertion prevents vacuous pass. All 21 current
segments verified covered. Source-grep inventory baseline bumped 136→138
with rationale (this + the F8 drift-pin).

### F6 ✅ AGG-8 — `exam_mode` CHECK constraint (LOW-MEDIUM, integrity)
**Done 2026-06-11:** `assignments_exam_mode_valid` check added to schema.pg.ts
+ idempotent journaled migration 0027 (normalize-then-constrain). BONUS drift
fix discovered en route: hand-written 0027/0028 migration files were never
journaled, so from-scratch migrate() was missing 3 system_settings columns and
the CI drift guard failed at HEAD — the catch-up migration journals all of it;
`check-migration-drift.sh` now green. Verified: from-scratch replay via the
integration suite (42/42) + constraint rejects the observed corrupt value "0.0".
Idempotent migration: normalize stray values
(`UPDATE assignments SET exam_mode='none' WHERE exam_mode NOT IN (...)`), then
`ALTER TABLE ... ADD CONSTRAINT ... CHECK (exam_mode IN ('none','scheduled','windowed'))`
guarded by IF NOT EXISTS-style idempotency per repo migration conventions
(see existing drizzle/00xx migrations). Keep schema.pg.ts in sync + drift guard.

### F7 ✅ AGG-9 — Restore DB-failure safe default in `isAiAssistantEnabled` (LOW)
**Done 2026-06-11:** try/catch restored; double-query outage now degrades to
the DEFAULT_PLATFORM_MODE-derived default. Regression test pins it.

### F8 ✅ AGG-10 — Consolidate effective-restrictions logic (LOW)
**Done 2026-06-11:** both `isAiAssistantEnabled` and
`isAiAssistantEnabledForContext` now delegate to
`getEffectiveModeRestrictions` (single source of truth); source-grep drift-pin
test added. 28+6 related tests + tsc + eslint green.

### F9 ✅ AGG-11a — Draft-recovery toast (LOW, 3 lenses)
**Done 2026-06-11:** hook gained an optional ref-held `onRestored` callback
fired exactly on server-draft restoration (never on the localStorage path —
that hydrates synchronously before this hook's GET resolves); the submission
form wires it to a sonner info toast with the draft's saved time (en+ko,
"this is your own saved work" copy to defuse the anti-cheat fear). Restoration
invariants untouched. +2 hook tests; i18n parity green.

### F10 ✅ AGG-11b — Admin override consequence copy + active indicator (LOW)
**Done 2026-06-11:** both override hints now state the GLOBAL/immediate-effect
consequence (en+ko); amber `role="status"` "overrides active" banner renders
next to the platform-mode selector whenever an override is effective
(yellow-700/dark:yellow-400 per the 22141e82 contrast convention; no tracking-*
on Korean). tsc/eslint/i18n tests green.

### F11 ✅ AGG-6 — Anti-cheat IP-overlap report (MEDIUM product gap, persona-security PS1)
**Done 2026-06-11:** `GET ?report=ipOverlap` on the existing
`canMonitorContest`-gated route aggregates a UNION of event + exam-session IPs:
shared IPs (>1 participant) and multi-IP participants (>2 IPs), both
LIMIT 100, assignment-scoped named params. Dashboard renders an amber advisory
panel (only when non-empty) with a benign-explanations hint referencing the
exam-integrity model (en+ko). Route tests: report shape + assignment scoping +
no fall-through to events query + 403 without monitor access. Component test
+ tsc + eslint green.

### F12 ✅ AGG-5 — Per-student exam time extension (MEDIUM product/fairness, 3 personas)
**Done 2026-06-11:**
- `extendExamSession` (exam-sessions.ts): SQL-side
  `personal_deadline + make_interval(mins => n)` so concurrent grants compose;
  extension-only (n ≥ 1 enforced in lib AND route schema 1–600).
- `PATCH /groups/[id]/assignments/[assignmentId]/exam-sessions/[userId]`
  gated by `canManageGroupResourcesAsync` (same write-power gate as score
  overrides — monitor-only staff cannot change time); windowed-only;
  404 when the participant never started; `recordAuditEventDurable`
  (`exam_session.extend` with actor/target/minutes/new deadline).
- `validateAssignmentSubmission` now honors an extended personal window PAST
  the assignment close for windowed exams (session fetched before the
  schedule check); non-exam assignments cannot slip through (pinned by test);
  late-penalty scoring already keys on personal_deadline so accommodation
  time is not penalized.
- UI: `ExamExtendDialog` (timer icon next to the session badge, both mobile
  card and desktop table views, `canManageOverrides`-gated), en+ko strings
  with explicit audit/extension-only copy.
- Tests: 5 route cases (success+audit shape, 403 monitor-only, 400 non-
  windowed, 404 no-session, schema bounds incl. non-integer) + 3
  validateAssignmentSubmission cases (extended-past-close allowed, doubly-
  expired rejected, non-exam cannot use the path). tsc/eslint green.

### F13 ✅ AGG-12 — Doc/runbook nits (LOW)
**Done 2026-06-11:** (a) runbook "Known signals" now opens with the exact
reap warn line + structured fields + alerting guidance and the stale-precursor
info line; (b) `docs/exam-integrity-model.md` gained a "Deliberate telemetry
boundaries" section (no fullscreen signal by decision; second-device honesty;
similarity + snapshot replay as containment). (c) covered by F2's policy-doc
update.

---

## Deferred register (cycle-1 2026-06-11) — findings NOT implemented this cycle
Per the strict deferral rules: severity preserved; security/correctness items
are deferred only where the repo's own carried-deferral precedent
(DEFER-ENV-GATES, documented in prior cycle plans) or non-defect status applies.

| ID | Finding (file+line) | Sev/Conf | Reason for deferral | Exit criterion |
|---|---|---|---|---|
| D1 | Cross-worker reclaim deadlock, `src/lib/judge/claim-query.ts:30-101` | LOW/Medium | Self-recovering (one aborted txn, retried next poll); trigger needs two simultaneously half-hung live workers; restructuring the hot path is riskier than the defect (debugger + critic concur) | Any `deadlock detected` involving `judge_workers` in prod logs |
| D3 | Registration clock-skew insta-stale, `src/lib/db/schema.pg.ts:438-440` | LOW/Medium | Transient mislabel healed ≤30 s by first heartbeat (DB-time); not a correctness defect | If `lastHeartbeatAt` default is ever touched, switch to DB-side `DEFAULT now()`; or NTP incident showing stale flapping |
| D4 | Pre-hydration keystroke burst not autosaved, `src/hooks/use-server-source-draft.ts:86-108` | LOW/High | Within the module's documented best-effort contract; localStorage covers the gap; fix would add effect-churn risk to never-clobber invariants | User report of lost pre-hydration edit, or any change to the hydration gate |
| CR2/P2 | Claim-route per-claim scoringModel SELECT, `claim/route.ts:323-337` | LOW/High | ~1 ms on a throughput-bounded path; consolidation belongs to the carried claim-SQL cluster (F3/F4 of 2026-05 series) to avoid two consecutive rewrites of the same SQL | Next claim-SQL change (e.g. F1 here touches worker_bump only — if F1 implementation ends up reshaping the SELECT, fold it in then) |
| P3 | Draft-autosave contest write load, `use-server-source-draft.ts` | INFO/Medium | Bounded (3 s debounce + per-user rate limit); monitoring note, not a defect | p95 DB latency degradation during first live contest |
| T4 | verify-db-backup restore-test not CI-exercised, `scripts/verify-db-backup.sh:27-49` | LOW/env-bound | Carried DEFER-ENV-GATES (no provisioned CI Postgres; repo precedent in prior cycle plans). Mocking it would fake the guarantee | CI Postgres provisioning |
| IN3/JA2 | Judging-delay banner for instructor/candidate seats | LOW/Medium | Feature; depends on a worker-health surface for non-admin roles — design needed (which roles see what); not a bug | Next ops-surface feature cycle; or a live incident where instructors were blind |
| TA1 | TA exam-content separation of duties (`canManageProblem` path 3) | LOW/High (policy) | Matches the documented capability model; needs a product decision (capability split `problems.edit_exam`), not a patch | Owner decides institutions need TA grade-only roles |
| TA2 | Per-assignment grading assignments for TAs | LOW/Medium | Feature note for large-course scale; no current user need | Course with >1 TA requests split grading |
| TR2 | Per-assignment AI-override granularity (platform-mode-context.ts:286-297) | LOW (product note) | Override is by-design, default-false, admin-only, audited; F10 adds the operator-mistake mitigation | Operator feedback that global granularity caused an exam incident |
| TH1 | Pino error noise from intentional error-path tests, `tests/unit/api/contests.route.test.ts` | LOW/High | Cosmetic CI-log hygiene; silencing via the test logger shim is mechanical but touches many assertions — batch with next test-hygiene pass | Next test-infra cycle, or a real failure being missed in CI logs |
| DES-ENV | Live agent-browser UI pass | n/a | Requires running server + provisioned Postgres (carried DEFER-ENV-GATES); static markup/a11y review done instead | Provisioned staging host reachable from review env |
| ST2 | Editor stays editable after personal deadline passes (exam UX) | LOW/Medium | Server rejects late submissions (integrity holds); F12 monitor work is the prerequisite surface; pure-UX state ("time expired, draft saved") needs design | Implement alongside F12 follow-up or next exam-UX cycle |
| PS2 | No fullscreen-presence signal in anti-cheat telemetry | LOW/High (policy) | Deliberate posture to document (F13b), not a defect; forced fullscreen is hostile UX and trivially evaded by second device | Owner decides to adopt fullscreen-required exams |
| CARRY | ARCH-CARRY-1 (raw judge handlers), ARCH-CARRY-2 (SSE O(n) eviction >500 conns), C3-AGG-5 (deploy-docker.sh size), DOC-C5-2 (staleClaimTimeoutMs doc field), C7-DS-1 (README /api/v1/time), N7-C7 (ICPC override live-rank), DEFER-ENV-GATES | as recorded | Carried from prior cycle plans with unchanged preconditions (see `plans/open/2026-05-29-cycle-7-rpf-review-remediation.md` + `plans/open/2026-06-03-…` L3 note) | As recorded in their origin plans |

No security, correctness, or data-loss finding from this cycle's reviews is
deferred: AGG-1/2/8 (the integrity/correctness items) are all scheduled above
(F1, F2, F6). D1/D3/D4 are LOW failure-mode notes whose "fix" is riskier or
moot, with explicit exit criteria. Deferred work remains bound by repo policy
(GPG-signed conventional+gitmoji commits, no --no-verify, etc.) when picked up.

---

## Plan archival done in this planning pass
- `plans/open/2026-06-03-multi-agent-review-remediation.md` → `plans/done/`
  (all 16 items ✅ done+pushed; re-verified against code by this cycle's
  verifier pass; its one open note N7-C7-ICPC is carried in the register above).

## Recommended sequence
1. F1 (judge core, tests first) → F6 (integrity constraint) → F2 (draft hardening).
2. F4 + F13 (docs) — cheap, unblock operators.
3. F5 (class-closer test) → F7/F8 (small code) → F3 (perf + 11c).
4. F9/F10 (UX) → F11 (IP overlap) → F12 (time extension, biggest).
Gates after each item; fine-grained signed commits; push per iteration.
