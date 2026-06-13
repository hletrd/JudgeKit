# RPF Cycle 7 (2026-06-13) — Aggregate Review

**Date:** 2026-06-13
**HEAD reviewed:** 0472b007 (main == origin/main, clean tree) — cycle-6's completed tree, deployed healthy on all three targets at 4e7691cf.
**Cycle:** 7/100 (orchestrator-numbered)
**Lenses:** 11 specialist + 6 persona files in this directory, all fresh at this HEAD (cycle-6 versions moved to `_archive/cycle-6-2026-06-12/`).
**Baseline gates on review HEAD (executed):** tsc 0 · eslint 0/0 · lint:bash clean · unit 339 files / 2650 tests PASS.

## AGENT FAILURES
No named reviewer subagents are registered in this environment (no Agent tool available to this cycle's runner; `.claude/` contains no agent definitions — same condition as cycles 1–6). Per the established fan-out fallback, every lens was executed directly by the cycle agent and written to its own file; no lens was dropped. Recorded for provenance.

## Merged findings (deduped; severity/confidence preserved at max across lenses)

### AGG7-1 — Anti-cheat DASHBOARD paging: poll-merge seam loss + loadMore duplication/no-stale-guard (MEDIUM, High, CONFIRMED)
**Lenses:** code-reviewer CR7-2, debugger D7-1/D7-2, tracer Trace 1/Trace 2, designer DES7-1, test-engineer TE7-2, architect A7-2, instructor IN7-1, assistant TA7-1, perspective-security §1, perspective-student (evidence-trust). **10-lens agreement — highest signal.**
`src/components/contest/anti-cheat-dashboard.tsx`:
- Poll merge (lines 125-148): when >1 page is loaded, `firstPage ++ prev.slice(PAGE_SIZE)` drops the `PAGE_SIZE-N..PAGE_SIZE-1` rows when N new events arrive — already-loaded evidence silently vanishes from the proctor's view.
- `loadMore` (lines 161-179): appends with NO id-dedupe and NO fetch-sequence guard — duplicate `key={event.id}` rows (line 577) + React key-collision warnings after a poll shifts the server list under a preserved `offset`.
The participant timeline got exactly these guards in cycle-6 G4
(`participant-anti-cheat-timeline.tsx:136-154`); the dashboard — same endpoint,
same pattern — was missed. **Fix:** mirror the timeline pattern adapted to the
dashboard's preserve-tail UX — (a) id-union poll merge (fresh first page, then
all previous rows not in it; `setOffset(merged.length)`); (b) `fetchSeqRef`
bump in `fetchEvents`, captured in `loadMore`, discard stale responses;
(c) id-dedupe on append. Component tests interleaving poll-merge with an
in-flight loadMore (TE7-2), kept O(page) (P7-2).

### AGG7-2 — Single-key offset/cap ordering on 7 sibling listings (LOW-MEDIUM, High, CONFIRMED)
**Lenses:** code-reviewer CR7-1, security SEC7-2, verifier V7-3, doc-specialist DOC7-2, designer DES7-2, test-engineer TE7-1, critic §1, student ST7-1, instructor IN7-3, admin AD7-1, applicant JA7-2. **11-lens agreement.**
Cycle-6 G4 fixed ONE instance (submissions listing); these siblings order by a
non-unique timestamp only, so same-timestamp rows shuffle across pages and the
cap boundary is nondeterministic:
- `anti-cheat/route.ts:292` (`createdAt`) — paged by dashboard + timeline.
- `admin/audit-logs/route.ts:269` (paged) + `:219` (CSV cap).
- `admin/login-logs/route.ts:129` (paged) + `:93` (CSV cap).
- `users/route.ts:46`, `files/route.ts:197`, `problems/route.ts:61` + `:131`.
**Fix:** add `desc(<table>.id)` as the second order key on each; mirror the
cycle-6 `orderBy` arity pin (`submissions.route.test.ts:758-759`) per route;
document the `(createdAt desc, id desc)` order for the anti-cheat GET in
`docs/api.md` (DOC7-2/V7-3). Grading ranks are GROUP-BY aggregates and are
unaffected (perspective-security §4).

### AGG7-3 — Contest access-token expiry not maintained across schedule edits (and invite re-issue) (MEDIUM, High, CONFIRMED)
**Lenses:** security SEC7-1, architect A7-1, debugger D7-3, tracer Trace 3, verifier V7-1, critic §2, test-engineer TE7-3, code-reviewer CR7-3, student ST7-2, instructor IN7-2, assistant TA7-2, applicant JA7-1, admin AD7-2, perspective-security §2. **14-lens agreement — highest signal.**
Cycle-6 G1 made the token VALIDITY rule uniform and set new-token expiry to the
effective close (`lateDeadline ?? deadline`), but the expiry is only DERIVED at
creation. Two unmaintained mutation points:
- **Schedule edit** (`updateAssignmentWithProblems`, management.ts:291-309)
  rewrites deadlines without re-deriving token expiry. EXTEND → tokens expire
  early (token-only participants denied during the bonus window; today an
  enrollment row incidentally rescues them, and pre-cycle-6 rows carry
  `deadline`-based expiry). SHORTEN → tokens outlive the new close (re-grants
  ingest/catalog past the close; submissions stay schedule-bound).
- **Invite re-issue** (`invite/route.ts:104-119`) uses `onConflictDoNothing`,
  so re-inviting a user with an existing token never refreshes a stale
  `expiresAt`.
**Fix:** own the sync in `src/lib/assignments/contest-access-tokens.ts`
(`syncContestAccessTokenExpiry(tx, assignmentId, {deadline, lateDeadline})`)
and call it inside the schedule-edit transaction (mirrors the in-tx
`revokeContestAccessTokensForGroup` pattern); make the invite insert
`onConflictDoUpdate` refresh `expiresAt`. This also retro-repairs pre-cycle-6
rows on the next edit (AD7-2 — no separate migration). Red-first tests:
extend/shorten/clear-deadline sync + invite refresh (TE7-3).

### AGG7-4 — `docs/api.md` anti-cheat POST eventType enum lists server-only classes (LOW-MEDIUM, High, CONFIRMED)
**Lenses:** verifier V7-2, doc-specialist DOC7-1, perspective-security §1.
`docs/api.md:815` documents the POST body eventType as including `ip_change`
and `code_similarity`, which the route's `z.enum(CLIENT_EVENT_TYPES)` schema
REJECTS (anti-forgery control, cycle-4 AGG4-2). **Fix:** correct the enum to
the 6 client types and note that `ip_change` / `code_similarity` /
`submission_stale_heartbeat` are server-generated and not acceptable in the
POST body.

## Deferral candidate (perf) — carried, exit criterion NOT fired this cycle
- **P6-1** — TS similarity fallback's normalize/n-gram phase neither
  time-slices nor honors the abort signal (`code-similarity.ts:266-275`).
  LOW/Medium (RISK). Bounded by the 500-row + 10k-literal caps; Rust sidecar
  is the default; fallback is staff-triggered and rare. **Exit:** any edit to
  `runSimilarityCheckTS`, or an incident implicating app-server event-loop
  stalls during a fallback run. No similarity-engine edit this cycle →
  carried.

## Cross-cycle carried register (exit criteria re-checked; unchanged this cycle)
| ID | Item | Sev/Conf | Exit criterion | This cycle |
|---|---|---|---|---|
| AGG5-7 | judge-worker-rs cosmetics (`docker.rs:517`,`:223`) | LOW/High | next behavioral judge-worker-rs edit folds them in | carry (no Rust edit) |
| AGG5-8 | Similarity rerun delete+reinsert resets first-flagged timestamps (`code-similarity.ts:439-451`) | LOW(policy)/Medium | owner evidence-retention decision, or a real dispute | carry |
| AGG3-7 | `run_remote_build` retry overwrites first failure log | LOW/Medium | next `run_remote_build` edit, or incident needing the first log | carry |
| DES3-1 | expired→active announced assertively (`exam-deadline-sync.tsx:107`) | LOW/Medium | next exam-page a11y pass | carry |
| ST5-5 | Countdown trusts client clock between refocus syncs (`countdown-timer.tsx:47`) | LOW/Medium | a cycle adding a server-time sync indicator | carry |
| TA3-1-followup / DES4-4 | Extension audit events in participant timeline; contest-list status nuance | LOW(product)/High | owner schedules timeline enrichment | carry |
| JA-clarity | No pre-test language-availability preview | LOW/Medium | owner decision on candidate test-info page | carry |
| DEFER-ENV-GATES | login-gated E2E + browser a11y audit (incl. DES carried a11y) | — | provisioned staging server/browser | carry |
| CI-RESTORE | wire `RESTORE_DATABASE_URL` into CI's postgres service (follow-up from abfa90f5) | LOW(ops)/High | next CI workflow edit touching the db service | carry |
| C3-AGG-5 | deploy-docker.sh SSH-helpers extraction (1433 lines) | — | any cycle touching SSH/remote-exec plumbing | carry (not touched) |
| IN2-2 | Pre-start accommodations / per-student duration overrides | — | owner decision | carry |
| (cycle-1 origin set) D1,D3,D4,CR2/P2,P3,T4,IN3/JA2,TA1,TA2,TR2,TH1,ST2,PS2,ARCH-CARRY-1/2,DOC-C5-2,C7-DS-1,N7-C7,C7-AGG-9,AGG2-8a | as recorded at origin (severities preserved there) | unchanged preconditions | carry |

## Cross-agent agreement summary (signal ranking)
1. **AGG7-3** (token-expiry lifecycle) — 14 lenses. Principal correctness/security fix.
2. **AGG7-2** (offset ordering siblings) — 11 lenses.
3. **AGG7-1** (dashboard paging fidelity) — 10 lenses.
4. **AGG7-4** (doc enum) — 3 lenses.

## Recommended sequence
1. AGG7-3 (token lifecycle sync; red-first) — principal fix.
2. AGG7-2 (offset id tiebreaks across 7 routes + doc order; red-first pins).
3. AGG7-1 (dashboard paging fidelity; component tests).
4. AGG7-4 (doc enum correction).
Gates after each item; fine-grained GPG-signed conventional+gitmoji commits;
`git pull --rebase` before each push; then DEPLOY_CMD (per-cycle, detached +
polled in-turn).
