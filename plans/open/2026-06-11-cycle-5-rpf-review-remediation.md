# Cycle 5 RPF review remediation (2026-06-11)

**Date:** 2026-06-11
**Cycle:** 5/100 of this RPF loop (orchestrator-numbered)
**HEAD at review:** 04b8c1ec (main) — cycle-4's completed tree, deployed
healthy on all three targets at 9966bfdf.
**Aggregate:** `.context/reviews/_aggregate.md` (cycle-5; 11 specialist + 6
persona lenses; cycle-4 lens files archived to
`.context/reviews/_archive/cycle-4-2026-06-11/`).
**Baseline gates on review HEAD:** tsc 0 · eslint 0/0 · lint:bash clean ·
unit 2606/2606 PASS.
**Highest-severity item:** AGG5-1 (MEDIUM-HIGH, 14-lens agreement).

Status legend: ✅ done+pushed · 🔧 in progress · ⬜ todo · 🟡 needs decision

---

## Implement this cycle

### G1 ⬜ AGG5-1 — Record the stale-heartbeat flag ONLY for ACCEPTED submissions, with submission linkage (MEDIUM-HIGH, High, CONFIRMED; 14-lens agreement)
The validator becomes probe-only; the submit route records after the accept
point. Completes cycle-4 AGG4-1's principle (flag ⇔ accepted submission).
- `validateAssignmentSubmission` option renamed
  `recordStaleHeartbeatFlag` → `probeStaleHeartbeat`; when set, the probe
  runs (client-event-filtered, unchanged) and the SUCCESS result gains
  `staleHeartbeat: { latestEventAt: number|null; ageMs: number|null;
  thresholdMs: number } | null` (null = fresh or probe skipped). NO insert
  in the validator (A5-1 command/query separation).
- `src/app/api/v1/submissions/route.ts`: pass `probeStaleHeartbeat: true`;
  AFTER the successful tx + submission fetch, if
  `assignmentValidation.staleHeartbeat`, insert the
  `submission_stale_heartbeat` event with `details` =
  `{ ...staleHeartbeat, submissionId: id }`, `ipAddress: ip`,
  `createdAt: dbNow` (DB time — fixes CR5-5 clock mix), fail-open
  `.catch` + `logger.warn` (pin preserved).
- Red-first tests (TE5-1): (1) mismatch path → validation fails, NO flag;
  (2) route-level rejection (rate-limited tx) → NO flag; (3) accepted →
  exactly one flag with submissionId/ipAddress/DB-time; (4) flag-insert
  failure → 201 still returned; (5) fresh heartbeat → no flag (carried).
- Docs in the same series (DOC5-1/2): `docs/exam-integrity-model.md` — flags
  are recorded only for accepted submissions and carry the submission id;
  `review-model.ts` comment matches. Lands AFTER the code change.

### G2 ⬜ AGG5-2 — Make the flag legible: labels, colors, details rendering; shared presentation module (MEDIUM, High, CONFIRMED)
- New `src/components/contest/anti-cheat-presentation.ts` (A5-2): shared
  `EVENT_TYPE_COLORS` (+ `submission_stale_heartbeat` red), `REVIEW_TIER_COLORS`,
  shared details formatter handling both `target` payloads and the stale-flag
  payload (humanized "last activity Xs before submission · threshold 90s ·
  submission <id>"); dashboard + participant timeline consume it.
- `messages/en.json` + `messages/ko.json`:
  `contests.antiCheat.eventTypes.submission_stale_heartbeat` (EN
  "Submission while monitor inactive" / KO "모니터 비활성 상태 제출" — default
  letter-spacing, no tracking utilities per repo rule) + detail-label keys.
- Replace the dead `?? event.eventType` fallback (CR5-2) with the
  `t(key) !== key` guard in both components.
- Tests (TE5-2): render a stale-flag row in both components → label asserted,
  no raw key path; catalog test pinning every `EVENT_TIERS` key has an
  `eventTypes.*` message in BOTH locales.

### G3 ⬜ AGG5-3 (+ resolves deferred AGG4-5, criterion FIRED) — Surface heartbeat gaps; make the scan opt-in; detect ongoing absence (MEDIUM, High, CONFIRMED)
- `anti-cheat/route.ts` GET: run the gap scan only when
  `includeGaps=1` AND `userId` present; append a synthetic boundary at DB
  NOW() so an absence continuing past the last heartbeat is emitted as a gap
  with `ongoing: true` (D5-3). Leading gap intentionally skipped — the
  monitor heartbeats on mount, recorded rationale.
- `participant-anti-cheat-timeline.tsx`: request `includeGaps=1`; render a
  gaps card (start → end, duration, ongoing badge) above the event table;
  i18n en+ko; reduced-motion-safe styling (DES5-4).
- **AGG4-5 disposition (exit criterion fired by this edit):** the per-poll
  5000-row scan becomes opt-in and consumed (cost now buys value; dashboard
  polls without the param skip it entirely). The unconditional `count(*)`
  REMAINS: it feeds pagination `total`, runs on `ace_assignment_user_idx`-
  covered predicates, and no incident has implicated it — recorded here as
  the considered resolution, not a silent re-defer.
- Tests (TE5-3): route — no `heartbeatGaps` field without the param; ongoing
  gap emitted when last heartbeat is older than threshold; component — gaps
  card renders, ongoing row distinct.

### G4 ⬜ AGG5-4 + AGG5-6 — Monitor resilience: in-flight slot recovery; SVG-safe describeElement (LOW-MEDIUM, Medium, LIKELY)
- `anti-cheat-storage.ts`: `loadInflightEvent` / `saveInflightEvent` /
  `clearInflightEvent` (single slot per assignment; validated like queue
  entries). `performFlush`: write the claimed event to the slot synchronously
  before `await sendEvent`, clear after the result is handled (try/finally);
  at flush start, recover a leftover slot to the queue head. Bounded
  duplicate-on-crash replaces silent loss-on-crash (critic §3 bias reversal).
- `describeElement` (AGG5-6): guard `typeof className === "string"` (or
  `getAttribute("class")`) so SVG targets cannot throw in the copy/paste
  listeners.
- Tests (TE5-4/TE5-6): component — claim → unmount mid-send → remount →
  re-sent exactly once; storage — corrupt slot dropped, slot cleared on
  ok/permanent; unit — SVG-target describeElement no-throw.

### G5 ⬜ AGG5-5 — Similarity reason truthfulness + route timer hygiene (LOW, High, CONFIRMED)
- `code-similarity.ts`: the rows>MAX TS-fallback guard returns
  `reason: "too_many_submissions"` (the declared enum member; wakes the
  existing translated UI branch). Sidecar-present path unchanged.
- `similarity-check/route.ts`: `clearTimeout` in `finally`.
- Tests (TE5-5): rows>MAX + sidecar null → `too_many_submissions`;
  sidecar present → completed regardless of count.

---

## Deferred register (cycle-5) — findings NOT implemented this cycle
Severity preserved; no security/correctness/data-loss finding is deferred
(AGG5-1/2/3/4/5/6 are all scheduled above).

| ID | Finding (file+line) | Sev/Conf | Reason for deferral | Exit criterion |
|---|---|---|---|---|
| AGG5-7 | judge-worker-rs cosmetics: vestigial pids_limit conditional (`docker.rs:517` — both branches "128") + misleading `should_retry_without_seccomp` name (`docker.rs:223`, gates a refusal) | LOW/High (CONFIRMED, behavior correct & fail-closed) | Rust edit requires worker-image rebuild on worker hosts; outside this cycle's configured gates (tsc/eslint/vitest/build); zero behavioral impact | Next cycle that edits judge-worker-rs for any behavioral reason folds both in |
| AGG5-8 | Similarity rerun delete+reinserts `code_similarity` events, resetting first-flagged timestamps (`code-similarity.ts:407-446`) | LOW(product/policy)/Medium (RISK) | Refresh-semantics vs evidence-history is an owner policy decision (duplicate-pair retention, dispute workflows); not a defect of the implemented design | Owner decides evidence-retention policy; or a real dispute needs first-flagged timing |

### Carried from cycle-4 (exit criteria re-checked this cycle)
| ID | Finding (file+line) | Sev/Conf | Reason for deferral | Exit criterion | This cycle |
|---|---|---|---|---|---|
| AGG4-5 | Anti-cheat GET read cost | LOW/Medium | — | next cycle that edits the GET | **FIRED → resolved in G3** (scan opt-in + consumed; count(*) retained with rationale) |
| AGG3-7 | `run_remote_build` retry overwrites first failure log | LOW/Medium | deploy script not edited this cycle | next `run_remote_build` edit adds `${out_file}.retry`; or incident needing the first log | carry |
| DES3-1 | expired→active announced politely, not assertively (`exam-deadline-sync.tsx:107`) | LOW(cosmetic)/Medium | a11y polish needing UX judgement | bundle with next exam-page a11y pass | carry |
| TA3-1-followup (+DES4-4) | Extension audit events in participant timeline; contest-list status label nuance | LOW(product)/High | new feature surface | owner schedules timeline enrichment; bundle with TA2 | carry |
| JA-clarity | No pre-test language-availability preview | LOW/Medium | product decision | owner decision on candidate test-info page | carry |

### CARRY register (re-materialized verbatim per the RPF plan convention; origin cycle-1/2/3/4 plans)
| ID | Item | Status |
|---|---|---|
| C3-AGG-5 | deploy-docker.sh SSH-helpers extraction — trigger remains TRIPPED (1433 lines); any cycle touching SSH/remote-exec plumbing must extract first | unchanged (not touched this cycle) |
| IN2-2 | Pre-start accommodations / per-student duration overrides (workaround: extend after start) | owner decision pending |
| DEFER-ENV-GATES | E2E for login-gated/user-facing features (incl. G5-E2E deadline-sync, DES-ENV browser a11y audit) — no provisioned test server/browser from this env | provisioned staging server |
| ST5-5 | Countdown trusts client clock between refocus syncs (`countdown-timer.tsx:47`); server enforcement unaffected | LOW/Medium — joins the register; exit: any cycle adding a server-time sync indicator to the exam header |
| D1, D3, D4, CR2/P2, P3, T4, IN3/JA2, TA1, TA2, TR2, TH1, ST2, PS2, ARCH-CARRY-1/2, DOC-C5-2, C7-DS-1, N7-C7, C7-AGG-9, AGG2-8a | As recorded at origin (cycle-1 register, severities preserved there) | unchanged preconditions |

Deferred work remains bound by repo policy when picked up (GPG-signed
conventional+gitmoji commits, no `--no-verify`, no force-push, tests per
AGENTS.md).

## Plan archival done in this planning pass
- `plans/open/2026-06-11-cycle-4-rpf-review-remediation.md` → `plans/done/`
  (G1–G4 all ✅ done+pushed; deploy exit criterion met and recorded in its
  completion section; its deferred rows re-materialized into the registers
  above).
- Standing plans (`2026-04-14-master-review-backlog.md`, `2026-04-17-*`,
  `2026-05-*` lanes) remain open — not cycle-scoped.

## Recommended sequence
1. G1 (probe-only validator + route-side recording; red-first) — the cycle's
   principal fix.
2. G2 (presentation module + catalogs) → G3 (gaps opt-in + UI; records the
   AGG4-5 resolution).
3. G4 (in-flight slot + SVG guard) → G5 (similarity reason + timer).
Gates after each item; fine-grained signed commits; pull --rebase + push per
iteration; then DEPLOY_CMD (per-cycle mode, detached + polled in-turn).
