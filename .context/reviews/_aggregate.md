# RPF Cycle 8 (2026-06-13) — Aggregate Review

**Date:** 2026-06-13
**HEAD reviewed:** c862ff72 (main == origin/main, clean tree) — cycle-7's
completed tree (G1–G4 done at 840f2183) plus the cycle-8 review-archive commit.
**Cycle:** 8/100 (orchestrator-numbered)
**Lenses:** 11 specialist + 6 persona files in this directory, all fresh at this
HEAD (cycle-7 versions moved to `_archive/cycle-7-2026-06-13/`).
**Baseline gates on review HEAD (executed):** tsc 0 · eslint 0/0 · lint:bash
clean · unit 340 files / 2661 tests PASS.

## AGENT FAILURES
No named reviewer subagents are registered in this environment, and no
`Agent`/`Task`-spawn tool is available to this cycle's runner (only TeamCreate /
SendMessage team-runtime and task-list tools; `.claude/agents/` and
`~/.claude/agents/` are empty — same condition as cycles 1–7). Per the
established fan-out fallback, every lens was executed directly by the cycle agent
and written to its own file; no lens was dropped. Recorded for provenance.

## Merged findings (deduped; severity/confidence preserved at max across lenses)

### AGG8-1 — Access-code redemption stamps token expiry at bare `deadline`, violating the canonical `lateDeadline ?? deadline` invariant (MEDIUM, High, CONFIRMED)
**Lenses (13-lens agreement — highest signal):** code-reviewer CR8-1,
security-reviewer SEC8-1, verifier V8-1, debugger D8-1, tracer Trace 1/Trace 2,
architect A8-1, critic §theme, designer DES8-1, document-specialist DOC8-1,
test-engineer TE8-1, perspective-student ST8-1, perspective-instructor IN8-1,
perspective-admin AD8-1, perspective-assistant TA8-1, perspective-job-applicant
JA8-1, perspective-security §1.

**File:** `src/lib/assignments/access-codes.ts:191` (`redeemAccessCode`).
Cycle-6 AGG6-1 established a single token-expiry invariant — a contest access
token expires at the **effective close** `lateDeadline ?? deadline` — behind one
helper `contestAccessTokenExpiry()` (`contest-access-tokens.ts:99-104`). Cycle-7
AGG7-3 propagated it to the invite insert/upsert (`invite/route.ts:115,124`) and
the schedule-edit sync (`management.ts:320`). **The access-code redemption insert
— the primary self-service join path — was never enumerated and still hard-codes
`expiresAt: assignment.deadline`.**

Internal contradiction: the same function computes `effectiveClose =
lateDeadline ?? deadline` at line 135 to gate the *join*, then ignores
`lateDeadline` for the *token expiry* at line 191.

**Concrete failure:** contest with `lateDeadline > deadline`. Access-code joiner's
token expires at `deadline`; invite joiner's at `lateDeadline`. Between the two
instants, the access-code joiner loses token-keyed catalog / platform-mode
visibility (`platform-mode-context.ts:96/126/151` apply
`CONTEST_ACCESS_TOKEN_VALIDITY_SQL`), so the contest disappears from their view
during a window the instructor opened — while invite joiners still see it.
Submission access is incidentally rescued by the auto-enrollment row
(access-codes.ts:195), which bounds severity to MEDIUM (visibility/consistency,
not total lockout) and makes the defect *restrictive* (never over-grants past the
close — no privilege escalation). It is nonetheless the exact "two join paths,
two access lifetimes" divergence cycles 6–7 set out to eliminate, on a
security-relevant access predicate, on the recruiting/exam surface the owner
cares about.

**Fix (minimal):** import and use `contestAccessTokenExpiry(assignment)` (the
loaded `assignment` already carries `deadline`+`lateDeadline`; `effectiveClose`
is already computed at line 135).
**Fix (structural, A8-1 — recommended to prevent a 4th divergence):** add a
`buildContestAccessTokenValues(...)` constructor in `contest-access-tokens.ts`
that derives `expiresAt` once; route both insert sites through it.
**Red-first test (TE8-1):** `access-codes.test.ts` redeem fixtures all set
`lateDeadline: null` (lines 154, 213) — add a redeem test with `lateDeadline` set
asserting the inserted token's `expiresAt === lateDeadline` (red on current code).
**Doc (DOC8-1, optional):** note in the access/exam-integrity docs that ALL token
creation paths derive expiry from the effective close.

**Not deferrable** — correctness/consistency on an access-control predicate; the
repo rules contain no exception permitting deferral of correctness findings.

## Secondary (LOW) — recorded, not scheduled as a standalone fix
### AGG8-2 — Heartbeat-gap scan cap ordered by timestamp only (LOW, Medium)
**Lenses:** debugger D8-2. **File:** `anti-cheat/route.ts:316-325`. The
`limit(5000)` "most recent heartbeats" query orders by `desc(createdAt)` without
a `desc(id)` tiebreak; at the exact cap boundary, same-timestamp rows could be
included/excluded nondeterministically, shifting the earliest detected gap by one
interval. This is a *bounded* scan, NOT a paged listing (correctly out of cycle-7
G2 scope); heartbeats are ~60 s apart so a same-second collision at row 5000 is
near-impossible. Deferred (see register) — exit: next edit to the heartbeat-gap
scan, or an incident where a gap boundary is disputed.

## Carried deferral (perf) — exit criterion NOT fired this cycle
- **P6-1** — TS similarity fallback's normalize/n-gram grouping phase neither
  time-slices nor honors the abort signal (`code-similarity.ts:266-275`).
  LOW/Medium (RISK). Bounded by 500-row + 10k-literal caps; Rust sidecar is the
  default; fallback staff-triggered and rare. `runSimilarityCheckTS` was NOT
  edited this cycle (recent similarity commits touched evidence-language /
  skip-reason, not this phase). **Exit:** any edit to `runSimilarityCheckTS`, or
  an incident implicating app-server event-loop stalls during a fallback run.
  Carried.

## Cross-cycle carried register (exit criteria re-checked; unchanged this cycle)
| ID | Item | Sev/Conf | Exit criterion | This cycle |
|---|---|---|---|---|
| AGG8-2 | heartbeat-gap scan cap timestamp-only ordered (`anti-cheat/route.ts:316-325`) | LOW/Medium | next edit to the gap scan, or a disputed gap boundary | NEW, deferred |
| AGG5-7 | judge-worker-rs cosmetics (`docker.rs:517`,`:223`) | LOW/High | next behavioral judge-worker-rs edit | carry (no Rust edit) |
| AGG5-8 | Similarity rerun delete+reinsert resets first-flagged timestamps (`code-similarity.ts:439-451`) | LOW(policy)/Medium | owner evidence-retention decision, or a real dispute | carry |
| AGG3-7 | `run_remote_build` retry overwrites first failure log | LOW/Medium | next `run_remote_build` edit, or incident needing the first log | carry |
| DES3-1 | expired→active announced assertively (`exam-deadline-sync.tsx:107`) | LOW/Medium | next exam-page a11y pass (browser) | carry |
| ST5-5 | Countdown trusts client clock between refocus syncs (`countdown-timer.tsx:47`) | LOW/Medium | a cycle adding a server-time sync indicator | carry |
| TA3-1-followup / DES4-4 | Extension audit events in participant timeline; contest-list status nuance | LOW(product)/High | owner schedules timeline enrichment | carry |
| JA-clarity | No pre-test language-availability preview | LOW/Medium | owner decision on candidate test-info page | carry |
| DEFER-ENV-GATES | login-gated E2E + browser a11y audit (incl. DES carried a11y) | — | provisioned staging server/browser | carry |
| CI-RESTORE | wire `RESTORE_DATABASE_URL` into CI's postgres service | LOW(ops)/High | next CI workflow edit touching the db service | carry |
| C3-AGG-5 | deploy-docker.sh SSH-helpers extraction (1433 lines) | — | any cycle touching SSH/remote-exec plumbing | carry (not touched) |
| IN2-2 | Pre-start accommodations / per-student duration overrides | — | owner decision | carry |
| (cycle-1 origin set) | as recorded at origin | severities preserved at origin | unchanged preconditions | carry |

## Cross-agent agreement summary (signal ranking)
1. **AGG8-1** (access-code token-expiry divergence) — 13 lenses incl. all 6
   personas. Principal correctness/consistency fix this cycle.
2. **AGG8-2** (heartbeat-gap scan cap order) — 1 lens, LOW, deferred.

## Recommended sequence
1. AGG8-1 (canonical token expiry at the access-code redeem path; red-first test
   with a `lateDeadline` fixture; optionally the values-constructor to close the
   class). Gate, fine-grained GPG-signed conventional+gitmoji commit,
   `git pull --rebase` before push.
2. Then DEPLOY_CMD (per-cycle, worv + algo; detached + polled in-turn; smoke
   https://test.worv.ai/ and https://algo.xylolabs.com/ for HTTP 200).
