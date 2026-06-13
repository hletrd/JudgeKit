# RPF Cycle 9 (2026-06-13) — Aggregate Review

**Date:** 2026-06-13
**HEAD reviewed:** da6179f3 (main == origin/main, clean tree) — cycle-8's
completed tree (AGG8-1 done at 51f232c9) + cycle-8 deploy/plan docs.
**Cycle:** 9/100 (orchestrator-numbered).
**Lenses:** 11 specialist + 6 persona files in this directory, all fresh at this
HEAD (cycle-8 versions moved to `_archive/cycle-8-2026-06-13/`).
**Baseline gates on review HEAD (executed):** tsc 0 · eslint 0/0 · lint:bash
clean · unit 340 files / 2663 tests PASS.

## AGENT FAILURES
No named reviewer subagents are registered in this environment (`.claude/agents/`
and `~/.claude/agents/` both empty), and no `Agent`/`Task`-spawn tool is available
to this cycle's runner — same condition as cycles 1–8. Per the established
fan-out fallback, every lens was executed directly by the cycle agent and written
to its own file; no lens was dropped. Recorded for provenance.

## Merged findings (deduped; severity/confidence preserved at max across lenses)

### AGG9-1 — Code-snapshot evidence timeline paginates by `created_at` only, no unique `id` tiebreak (MEDIUM, High, CONFIRMED) — PRINCIPAL FIX
**Lenses (12-lens agreement — highest signal):** code-reviewer CR9-1, debugger
D9-1, security-reviewer SEC9-1, verifier V9-1, tracer Trace 1, critic §theme,
designer DES9-1, test-engineer TE9-1, perspective-student ST9-1,
perspective-instructor IN9-1, perspective-assistant TA9-1, perspective-admin
AD9-1, perspective-job-applicant JA9-1, perspective-security §1.

**File:** `src/app/api/v1/contests/[assignmentId]/code-snapshots/[userId]/route.ts:54`.
`.orderBy(asc(codeSnapshots.createdAt))` with `.limit().offset()` paging
(default 50 / max 200) and **no unique second sort key.** `code_snapshots`
(`schema.pg.ts:1007`) has a `nanoid` PK `id` and a plain `created_at` index;
snapshots are POSTed one row at a time by editor autosave
(`code-snapshots/route.ts:79`, `created_at` defaults to `new Date()`), so rapid
edits land in the same millisecond. Postgres gives no stable order among equal
`created_at` rows and may reorder per query → an instructor/recruiter paging a
candidate's snapshot timeline can see a snapshot **duplicated across page N/N+1
or dropped at the seam.** This is the exact class cycle-7 (4cf6dfe0) fixed for 7
sibling routes; this **anti-cheat evidence** route was missed, and it is MORE
collision-prone than the heartbeat scan deferred as AGG8-2 (heartbeats ~60 s
apart; snapshots cluster). On an integrity-evidence surface, incomplete/duplicated
evidence is a fairness risk to the student/candidate and undermines a defensible
misconduct finding.
**Fix (minimal):** append `asc(codeSnapshots.id)` to the orderBy.
**Not deferrable** — correctness on an integrity-evidence listing; repo rules
contain no exception permitting deferral of correctness findings.

### AGG9-2 — Recruiting-invitation list paginates by `createdAt` only, no tiebreak (MEDIUM, High, CONFIRMED)
**Lenses:** code-reviewer CR9-2, verifier V9-1, perspective-instructor IN9-2,
perspective-admin AD9-1, test-engineer TE9-1.
**File:** `src/lib/assignments/recruiting-invitations.ts:272`.
`.orderBy(recruitingInvitations.createdAt)` (single asc column) +
`.limit(≤500).offset(offset)` (lines 247-248,273-274). `id` is the nanoid PK. A
recruiter paging the candidate list (bulk CSV import creates many rows fast) can
get an invitation duplicated or skipped at a page boundary.
**Fix:** append `, recruitingInvitations.id` (asc) to the orderBy.
**Not deferrable** — same class/severity as AGG9-1.

### AGG9-3 — Public accepted-solutions list: all 3 sort modes lack a unique tiebreak (MEDIUM, Medium, CONFIRMED)
**Lenses:** code-reviewer CR9-3, verifier V9-1, test-engineer TE9-1.
**File:** `src/app/api/v1/problems/[id]/accepted-solutions/route.ts:54-59`,
offset-paged (`offset = (page-1)*pageSize` line 34, `.offset(offset)` line 80).
`newest` = `desc(submittedAt)` alone; `shortest`/`fastest` tiebreak only on
`submittedAt`. None ends in a unique column → equal-key rows reorder across pages
on the public solution browser.
**Fix:** append `desc(submissions.id)` as the final clause of every branch.
**Not deferrable** — correctness on a public listing (lower traffic than
AGG9-1/2, hence Medium confidence, but the same class).

### AGG9-4 (test gap) — listing-order contract test is an incomplete allow-list (test gap, High)
**Lenses:** test-engineer TE9-1, tracer Trace 2, architect A9-1.
**File:** `tests/unit/api/listing-order-tiebreak.test.ts`. The AGG7-2 source-grep
contract enumerates only 5 routes and omitted the three above — the sweep's own
gate let them slip. **Fix:** extend the contract test with tailored assertions
for the three routes (RED on current source, GREEN after each orderBy fix),
keeping it the single source of truth for the invariant.

## Cross-cycle carried register (exit criteria re-checked; unchanged this cycle)
| ID | Item | Sev/Conf | Exit criterion | This cycle |
|---|---|---|---|---|
| AGG8-2 | heartbeat-gap scan `limit(5000)` ordered `desc(createdAt)` only (`anti-cheat/route.ts:316-325`) | LOW/Medium | next edit to the gap scan, or a disputed gap boundary | carry — block UNCHANGED; CR9-1 is a *different* route and does NOT reopen it |
| P6-1 | TS similarity fallback normalize/n-gram phase no time-slice/abort (`code-similarity.ts:266-275`) | LOW/Medium (RISK) | any edit to `runSimilarityCheckTS`, or an event-loop-stall incident | carry — not edited |
| AGG5-7 | judge-worker-rs cosmetics (`docker.rs:517`,`:223`) | LOW/High | next behavioral judge-worker-rs edit | carry (no Rust edit) |
| AGG5-8 | similarity rerun delete+reinsert resets first-flagged ts (`code-similarity.ts:439-451`) | LOW(policy)/Medium | owner evidence-retention decision, or a real dispute | carry |
| AGG3-7 | `run_remote_build` retry overwrites first failure log | LOW/Medium | next `run_remote_build` edit, or incident needing the first log | carry |
| DES3-1 | expired→active announced assertively (`exam-deadline-sync.tsx:107`) | LOW/Medium | next exam-page a11y pass (browser) | carry |
| ST5-5 | countdown trusts client clock between syncs (`countdown-timer.tsx:47`) | LOW/Medium | a cycle adding a server-time sync indicator | carry |
| TA3-1-followup / DES4-4 | extension audit events in participant timeline; contest-list status nuance | LOW(product)/High | owner schedules timeline enrichment | carry |
| JA-clarity | no pre-test language-availability preview | LOW/Medium | owner decision on candidate test-info page | carry |
| DEFER-ENV-GATES | login-gated E2E + browser a11y audit | — | provisioned staging server/browser | carry |
| CI-RESTORE | wire `RESTORE_DATABASE_URL` into CI's postgres service | LOW(ops)/High | next CI workflow edit touching the db service | carry |
| C3-AGG-5 | deploy-docker.sh SSH-helpers extraction (1433 lines) | — | any cycle touching SSH/remote-exec plumbing | carry (not touched) |
| IN2-2 | pre-start accommodations / per-student duration overrides | — | owner decision | carry |
| A8-1 | optional `buildContestAccessTokenValues(...)` constructor (no-future-drift hardening, NOT a finding) | — | a 5th token-insert site is added | carry (hardening direction, not deferred) |
| (cycle-1 origin set) | as recorded at origin | severities preserved at origin | unchanged preconditions | carry |

## Cross-agent agreement summary (signal ranking)
1. **AGG9-1** (code-snapshot evidence paging order) — 14 lenses incl. all 6
   personas. Principal correctness/integrity fix this cycle.
2. **AGG9-2** (recruiting-invitation list order) — 5 lenses.
3. **AGG9-3** (accepted-solutions sort order) — 3 lenses.
4. **AGG9-4** (incomplete contract test) — 3 lenses; the regression-prevention
   companion to 9-1/2/3.

## Recommended sequence
1. AGG9-4-first: extend `listing-order-tiebreak.test.ts` with the 3 tailored
   assertions (RED).
2. AGG9-1: add `asc(codeSnapshots.id)` tiebreak (GREEN for its assertion).
3. AGG9-2: add `recruitingInvitations.id` tiebreak.
4. AGG9-3: add `desc(submissions.id)` to every sort branch.
Gate after each; fine-grained GPG-signed conventional+gitmoji commits;
`git pull --rebase` before push. Then DEPLOY_CMD (per-cycle worv + algo; smoke
https://test.worv.ai/ and https://algo.xylolabs.com/ for HTTP 200).
