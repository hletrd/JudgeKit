# RPF Cycle 1 (2026-06-11 series) — Aggregate Review

**Date:** 2026-06-11
**HEAD reviewed:** f977ef4c (main)
**Cycle:** 1/100 (orchestrator-numbered; follows the 2026-05-29 series and the 2026-06-03 multi-agent pass)
**Lenses (17):** security-reviewer, code-reviewer, perf-reviewer, verifier, tracer,
debugger, architect, test-engineer, critic, document-specialist, designer +
personas: student, instructor, admin, assistant, job-applicant, security
(all in `.context/reviews/*.md`; prior aggregate preserved as
`_aggregate-cycle-9-2026-05-29-snapshot.md`).
**Gate baseline on this HEAD (verifier, re-run):** tsc 0 · eslint 0/0 ·
lint:bash clean · unit 330 files / 2551 tests PASS.
**Change surface:** 76 commits since 24939e42; depth on the 30 commits after
804c8db3 (the 2026-06-03 remediation wave itself + Jun-4/5 follow-ups).
All 16 remediation items (C1, H1–H6, M1–M6, L1–L3) re-verified as genuinely
implemented (verifier). **No HIGH finding this cycle** (critic severity-honesty
check concurs — stated plainly, not padded).

## AGENT FAILURES
None. (Specialist/persona fan-out completed across two runs of this cycle
after an interruption; every file re-checked fresh against HEAD f977ef4c.)

---

## Deduplicated findings — ACTIONABLE THIS CYCLE

### AGG-1 — Self-reclaim `active_tasks` leak in claim SQL (MEDIUM, High signal: code-reviewer CR1 + tracer T1 + debugger D2 + test-engineer T1 + admin AD2 + persona-security endorse)
`src/lib/judge/claim-query.ts:80-101`. `prev_worker_release` is guarded by
`previous_worker_id <> @workerId` (required — Postgres forbids two modifying
CTEs updating one row), so a worker reclaiming ITS OWN stale submission bumps
`active_tasks` twice but is decremented once → permanent +1 on a healthy
worker; sweep only heals fully-silent workers. Contest-day capacity corrosion.
**Fix:** compensate inside `worker_bump`'s SET expression
(`+ 1 - (SELECT COUNT(*) FROM candidate c WHERE c.previous_worker_id = @workerId AND EXISTS (SELECT 1 FROM claimed))`);
add structural unit assertion + same-worker integration case (T1); add the
invariant comments architect A3 specifies (why `<>` must stay; lock order).

### AGG-2 — Draft API: junk `language` strings → unbounded `source_drafts` growth; table has no retention (MEDIUM, security S1 + admin + document-specialist DS1-gap + test-engineer T2)
`src/app/api/v1/problems/[id]/draft/route.ts:17-19` accepts any ≤64-char
string as `language`; one row per (user, problem, language) of up to 64 KiB;
`data-retention-maintenance.ts` never prunes drafts.
**Fix:** validate against the judge language registry in PUT/DELETE (400 on
unknown); add a 400 unit case + happy case; add `source_drafts` to retention
pruning and a line to `docs/data-retention-policy.md`.

### AGG-3 — Full-catalog ID fetch per /problems & /practice view for stable numbering (MEDIUM, perf P1 + code-reviewer CR4 + critic #2)
`src/app/(public)/problems/page.tsx:469-482`,
`src/app/(public)/practice/page.tsx:538-549` — SELECT every visible problem id
+ whole-catalog JS Map per page view to number ~20 rows; same query shape M4
just removed from analytics.
**Fix:** SQL `row_number() OVER (ORDER BY sequence_number, created_at)` in a
subquery filtered to the page's ids; dedupe the duplicated ordering expression.

### AGG-4 — NODE_ENCRYPTION_KEY boot-required but undocumented for operators (MEDIUM, document-specialist DS2 + admin AD1)
`src/lib/security/production-config.ts:31` hard-requires it; absent from
`.env.example`, `.env.production.example`, and `docs/deployment.md` required-env
table (which lists only the DIFFERENT `PLUGIN_CONFIG_ENCRYPTION_KEY`). Fresh
tenant following docs → crash-looping container.
**Fix:** add to both templates + deployment doc, distinguishing the two keys.

### AGG-5 — No per-student exam time extension exists (MEDIUM product/fairness, personas: student ST1 + instructor IN1 + job-applicant JA1, confidence High)
No field or staff endpoint mutates `exam_sessions.personal_deadline`
(`schema.pg.ts:384`). Accommodations (legally mandated extra time), outage
recovery, and recruiting incident recovery all have no tool short of SQL.
**Fix (feature):** staff endpoint (gated `canManageContest`/group-staff) to
extend a participant's personalDeadline (never shrink below original; clamp ≥
now), durable audit event, surfaced on the exam monitor. Plan as this cycle's
feature item.

### AGG-6 — Anti-cheat captures IPs but never correlates them (MEDIUM product gap, persona-security PS1)
`exam_sessions.ip_address` + per-event IPs stored; dashboard shows per-row IP
(`anti-cheat-dashboard.tsx:523,587`) but no "same IP, multiple participants" /
"one participant, many IPs" aggregation — duplicate-account and collusion
hunting is manual. **Fix:** staff-only IP-overlap report on the anti-cheat
dashboard (read-only GROUP BY; no new collection).

### AGG-7 — CSP nonce-matcher enumeration class still open (LOW→MEDIUM trend; security S2 + architect A1 + tracer Trace-3 + test-engineer T3 + critic #1)
`src/proxy.ts:391-427` vs `next.config.ts:156-170`: two regressions of this
class have shipped; unmatched-path 404s still fall to the strict fallback.
**Fix now (cheap class-closer):** unit guard test in the repo's
source-grep-guard idiom walking `src/app/**` top-level page segments and
asserting each maps into the matcher. Catch-all matcher deferred until
middleware cost on arbitrary paths is measured.

### AGG-8 — `assignments.exam_mode` lacks a DB CHECK constraint (LOW-MEDIUM, security S3 + persona-security §5)
Corrupt value (observed `"0.0"` in prod once) makes exam/not-exam readers
disagree — grading-integrity hazard on recurrence. Client-side coercion
(2388302e) is cosmetic. **Fix:** idempotent migration adding
`CHECK (exam_mode IN ('none','scheduled','windowed'))` (after normalizing any
stray rows in the same migration), per repo migration conventions.

### AGG-9 — `isAiAssistantEnabled` lost its DB-failure safe default (LOW, code-reviewer CR3)
`src/lib/system-settings.ts:218-228`: double-failure now propagates to page
render instead of degrading. **Fix:** restore try/catch returning the
mode-derived default.

### AGG-10 — Effective-restrictions logic duplicated (LOW, architect A2)
`getEffectiveModeRestrictions` vs inline logic in
`platform-mode-context.ts:288-293`. **Fix:** make
`isAiAssistantEnabledForContext` call the helper.

### AGG-11 — UX cluster (LOW, designer + personas, fix-cheap):
(a) **UX3/ST3/JA:** silent server-draft recovery → one-line sonner toast
("recovered draft from <time>"); highest value in the recruiting seat.
(b) **UX2/AD3/critic#5:** admin restricted-mode override checkboxes need
consequence helper text + an "overrides active" indicator near the mode
selector.
(c) **UX1/IN2/critic#4:** per-viewer /problems numbers — add a tooltip/hint
("numbering reflects your visible catalog") when fixing AGG-3 in the same
files.

### AGG-12 — Doc/runbook nits (LOW, doc-specialist + admin AD4 + persona-security PS2):
(a) name the exact sweep reap log line in
`docs/judge-worker-incident-runbook.md` as the alert signature;
(b) document the anti-cheat telemetry posture (deterrence+evidence, no
fullscreen signal — deliberate) in the anti-cheat doc;
(c) when AGG-2 lands, add the drafts retention line (covered there).

## Findings to RECORD AS DEFERRED (plan dir, with exit criteria)
- **D1** cross-worker reclaim deadlock (LOW, debugger; critic concurs defer)
  — exit criterion: any `deadlock detected` on `judge_workers` in prod logs.
- **D3** registration clock-skew insta-stale (LOW) — runbook note only;
  DB-side `DEFAULT now()` if ever touched again.
- **D4** pre-hydration keystroke not autosaved (LOW) — within documented
  best-effort contract; localStorage covers.
- **CR2/P2** claim-route extra scoringModel SELECT (LOW) — fold into carried
  claim-SQL consolidation cluster (F3/F4).
- **P3** draft-autosave write load (INFO) — monitoring note for first live
  contest.
- **T4** backup restore-test CI exercise — env-bound (carried DEFER-ENV-GATES).
- **IN3/JA2** judging-delay banner for instructor/candidate (LOW feature) —
  pairs with future ops-surface work; record as deferred product item.
- **TA1** TA exam-content separation-of-duties capability split (LOW policy
  decision) / **TA2** per-assignment grading assignments (LOW feature note).
- **Trace-2 note** per-assignment AI-override granularity (LOW product note;
  AGG-11b covers the operator-mistake mitigation).
- **Test hygiene:** pino error noise in `contests.route.test.ts` logs (LOW).
- **Designer:** live agent-browser pass requires provisioned server+DB
  (carried DEFER-ENV-GATES); static a11y review done instead.
- **Carried unchanged:** ARCH-CARRY-1 (raw judge handlers), ARCH-CARRY-2 (SSE
  O(n) eviction), deploy-docker.sh size (C3-AGG-5), DOC-C5-2
  (staleClaimTimeoutMs doc field), C7-DS-1 (README /api/v1/time), N7-C7 (ICPC
  override live-rank product decision).

## Cross-agent agreement (signal table)
| Finding | Lenses agreeing |
|---|---|
| AGG-1 self-reclaim leak | 4 specialist + 2 persona |
| AGG-3 catalog scan | 3 |
| AGG-7 CSP enumeration class | 5 |
| AGG-5 time extension | 3 personas (independent seats) |
| AGG-2 draft growth | 3 |
| AGG-4 env-var doc gap | 2 |
| AGG-11a silent recovery | 3 |

## Verified-sound highlights (no action; provenance in per-lens files)
Sandbox hardening flags (persona-security §2); hidden-test-case query-shape
confidentiality (§4); all 16 remediation fixes; draft-hook safety invariants;
RBAC remediation wave incl. TA boundary sweep (no regression); IOI scoring
end-to-end; backup restore-test script; durable audit; staleness sweep design.
