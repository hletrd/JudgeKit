# Cycle 6 RPF review remediation (2026-06-12)

**Date:** 2026-06-12
**Cycle:** 6/100 of this RPF loop (orchestrator-numbered)
**HEAD at review:** 22e1510f (main) — cycle-5's completed tree, deployed healthy on all three targets at bcfa32aa.
**Aggregate:** `.context/reviews/_aggregate.md` (cycle-6; 11 specialist + 6 persona lenses; cycle-5 lens files archived to `.context/reviews/_archive/cycle-5-2026-06-12/`).
**Baseline gates on review HEAD:** tsc 0 · eslint 0/0 · lint:bash clean · unit 338 files / 2632 tests PASS.
**Highest-severity item:** AGG6-1 (MEDIUM, 12-lens agreement).

Status legend: ✅ done+pushed · 🔧 in progress · ⬜ todo · 🟡 needs decision

---

## Implement this cycle

### G1 ✅ AGG6-1 — Contest access-token lifecycle: shared expiry-checked predicate + revocation on roster removal + effective-close expiry at creation (MEDIUM, High, CONFIRMED; 12-lens agreement)
- New `src/lib/assignments/contest-access-tokens.ts` (A6-1): exports
  `findValidContestAccessToken(assignmentId, userId)` (Drizzle; filters
  `expiresAt IS NULL OR expiresAt > NOW()` via DB-time SQL) and
  `VALID_CONTEST_ACCESS_TOKEN_EXISTS_SQL` (named-param EXISTS fragment) so the
  raw-SQL gates and Drizzle gates share one semantic. Lifecycle writes
  co-located: `revokeContestAccessTokensForGroup(tx, groupId, userId)`
  (DELETE … USING assignments join) used by the member-removal route.
- Consume the validity predicate in the three unchecked gates:
  `validateAssignmentSubmission` (`src/lib/assignments/submissions.ts:324-330`),
  `getContestUserStatus` (`src/lib/assignments/public-contests.ts:224-231`),
  `getEnrolledContestDetail` (`:291-297`).
- `DELETE /api/v1/groups/[id]/members/[userId]`: inside the existing tx, after
  the enrollment delete, revoke the user's contest access tokens for that
  group's assignments; add `revokedAccessTokens: <count>` to the audit details.
- Creation expiry = effective close: invite route
  (`src/app/api/v1/contests/[assignmentId]/invite/route.ts`) and recruiting
  redemption (`src/lib/assignments/recruiting-invitations.ts:680-687`) set
  `expiresAt = lateDeadline ?? deadline` (extend `getContestAssignment` /
  the redemption's assignment fetch with `lateDeadline`), preserving the
  late-submission window for invited users under the now-enforced expiry.
- Red-first tests (TE6-1): (a) expired token → submit validation fails 403;
  (b) un-enrolled + valid token → allowed (pins the grant); (c) member removal
  deletes the tokens (and audit count); (d) read-side gates deny expired
  tokens; (e) invite/redemption store effective-close expiry.

### G2 ✅ AGG6-2 — Queue-first `reportEvent`: close the last silent telemetry-loss window (MEDIUM, High, CONFIRMED; fired cycle-5 G4 residual)
- `anti-cheat-monitor.tsx:195-225`: after the MIN_INTERVAL throttle, append the
  event to the pending queue synchronously (retries: 0) and call
  `flushPendingEvents()`; delete the direct `sendEvent` branch. The claim
  loop's slot+claim ordering, single-flight guard, and `scheduleRetryRef`
  backoff then cover first transmission too (flush-in-progress case is picked
  up by the retry timer ≤1 s later).
- Tests (TE6-2): component — reportEvent → unmount before the fetch resolves →
  remount → event transmitted exactly once; existing monitor tests must stay
  green (ordering: queued events flush FIFO).

### G3 ✅ AGG6-3 — Keyboard-operable filter chips with pressed semantics (MEDIUM a11y, High, CONFIRMED)
- `anti-cheat-dashboard.tsx:459-475` + `participant-anti-cheat-timeline.tsx:251-269`:
  Badge `render={<button type="button" />}` + `aria-pressed={active}`; keep
  the existing classes (focus-visible ring already in badge variants).
- Tests (TE6-3): chips reachable by Tab and toggled by keyboard activation;
  `aria-pressed` asserted in both components.

### G4 ✅ AGG6-5 + AGG6-6 — Listing/timeline determinism: offset id tiebreak; stale-loadMore guard (LOW-MEDIUM + LOW)
- `submissions/route.ts:167`: `orderBy(desc(submittedAt), desc(id))` to match
  cursor mode; shape test (TE6-4). Note the (submittedAt, id) order in
  `docs/api.md` submissions section (doc-specialist follow-through).
- `participant-anti-cheat-timeline.tsx`: fetch-sequence counter — `loadMore`
  captures the current seq and discards its response if a poll reset bumped
  it; defensive id-dedupe on append. Component test interleaving poll reset
  with an in-flight loadMore (no duplicate ids rendered).

### G5 ✅ AGG6-7 + AGG6-8 — Similarity evidence and vocabulary hygiene (LOW, High)
- `code-similarity.ts:428-432`: add `language: pair.language` to the
  `code_similarity` details payload; test asserts it.
- Remove unreachable `service_unavailable`: enum member
  (`code-similarity.ts:242`), dashboard type+branch
  (`anti-cheat-dashboard.tsx:74,299`), `similarityServiceUnavailable` keys in
  `messages/en.json:2313` + `messages/ko.json`; adjust the catalog-pin /
  source-grep baselines WITH justification in the commit body (TE6-5).

### G6 ✅ AGG6-4 — Heartbeat LRU eviction on insert failure (LOW, Medium, RISK)
- `anti-cheat/route.ts:146-158`: wrap the heartbeat insert; on throw, delete
  the LRU key, then rethrow (client correctly sees 5xx → retries → next
  attempt re-inserts). Shared-coordination path unchanged (DB-backed).
- Test (TE6-6): one-shot insert failure → key evicted → immediate retry
  records the row.

### G7 ✅ AGG6-9 — Registers + comment truthfulness (LOW–MEDIUM doc, High)
- `plans/open/user-injected/pending-next-cycle.md`: mark #1 RESOLVED
  (evidence: `plans/archive/2026-04-29-archived-workspace-to-public-migration.md`
  "ALL PHASES COMPLETE"; no `(workspace)` route group in `src/app`) and #3
  RESOLVED (evidence: `deploy-docker.sh:657` `ensure_env_literal
  COMPILER_RUNNER_URL` + drift warning `:663-666`), following the file's own
  item-#2 precedent.
- `anti-cheat/route.ts:192-195`: correct the false `canManageContest` claim
  (POST is the student ingest; name the real write surfaces).

---

## Deferred register (cycle-6) — findings NOT implemented this cycle
Severity preserved; no security/correctness/data-loss finding is deferred
(AGG6-1…9 are all scheduled above).

| ID | Finding (file+line) | Sev/Conf | Reason for deferral | Exit criterion |
|---|---|---|---|---|
| P6-1 | TS similarity fallback's normalize/n-gram phase neither time-slices nor honors the abort signal (`code-similarity.ts:266-275`) | LOW/Medium (RISK) | Bounded by the 500-row cap + 10k literal cap; Rust sidecar is the default engine; fallback is staff-triggered and rare | Any edit to `runSimilarityCheckTS`; or an incident implicating app-server event-loop stalls during a fallback run |

### Carried from cycle-5 (exit criteria re-checked this cycle)
| ID | Finding (file+line) | Sev/Conf | Reason | Exit criterion | This cycle |
|---|---|---|---|---|---|
| AGG5-7 | judge-worker-rs cosmetics (`docker.rs:517`, `:223`) | LOW/High | Rust edit needs worker-image rebuild; outside configured gates; zero behavioral impact | Next behavioral judge-worker-rs edit folds both in | carry (no Rust edit this cycle) |
| AGG5-8 | Similarity rerun delete+reinserts `code_similarity` events, resetting first-flagged timestamps (`code-similarity.ts:439-451`) | LOW(policy)/Medium | Owner evidence-retention policy decision | Owner decides; or a real dispute needs first-flagged timing | carry (G5 touches the details payload only, not the rerun lifecycle) |
| AGG3-7 | `run_remote_build` retry overwrites first failure log | LOW/Medium | deploy script not edited this cycle | next `run_remote_build` edit; or incident needing the first log | carry |
| DES3-1 | expired→active announced politely (`exam-deadline-sync.tsx:107`) | LOW/Medium | a11y polish needing UX judgement | bundle with next exam-page a11y pass (G3 touches contest views, not the exam page) | carry |
| TA3-1-followup (+DES4-4) | Extension audit events in participant timeline; contest-list status nuance | LOW(product)/High | new feature surface | owner schedules timeline enrichment | carry |
| JA-clarity | No pre-test language-availability preview | LOW/Medium | product decision | owner decision on candidate test-info page | carry |
| ST5-5 | Countdown trusts client clock between refocus syncs (`countdown-timer.tsx:47`) | LOW/Medium | display-only; server enforcement unaffected | any cycle adding a server-time sync indicator to the exam header | carry |

### CARRY register (re-materialized per the RPF plan convention; origin cycle-1…5 plans)
| ID | Item | Status |
|---|---|---|
| C3-AGG-5 | deploy-docker.sh SSH-helpers extraction — trigger remains TRIPPED (1433 lines); any cycle touching SSH/remote-exec plumbing must extract first | unchanged (not touched this cycle) |
| IN2-2 | Pre-start accommodations / per-student duration overrides (workaround: extend after start) | owner decision pending |
| DEFER-ENV-GATES | E2E for login-gated/user-facing features (incl. G5-E2E deadline-sync, DES-ENV browser a11y audit) — no provisioned test server/browser from this env | provisioned staging server |
| D1, D3, D4, CR2/P2, P3, T4, IN3/JA2, TA1, TA2, TR2, TH1, ST2, PS2, ARCH-CARRY-1/2, DOC-C5-2, C7-DS-1, N7-C7, C7-AGG-9, AGG2-8a | As recorded at origin (cycle-1 register, severities preserved there) | unchanged preconditions |

Deferred work remains bound by repo policy when picked up (GPG-signed
conventional+gitmoji commits, no `--no-verify`, no force-push, tests per
AGENTS.md).

## Plan archival done in this planning pass
- `plans/open/2026-06-11-cycle-5-rpf-review-remediation.md` → `plans/done/`
  (G1–G5 all ✅ done+pushed; three-target deploy success recorded at
  bcfa32aa; its deferred rows re-materialized into the registers above).
- `plans/open/user-injected/pending-next-cycle.md` updated in G7 (items #1/#3
  marked RESOLVED with evidence; file retained as the standing intake point).
- Standing plans (`2026-04-14-master-review-backlog.md`, `2026-04-17-*`)
  remain open — not cycle-scoped.

## Recommended sequence
1. G1 (token lifecycle; red-first) — the cycle's principal fix.
2. G2 (queue-first reportEvent) → G6 (LRU eviction) — monitor/ingest pair.
3. G3 (keyboard chips) → G4 (determinism pair).
4. G5 (similarity hygiene) → G7 (registers/comment).
Gates after each item; fine-grained signed commits; pull --rebase + push per
iteration; then DEPLOY_CMD (per-cycle mode, detached + polled in-turn).

---

## Completion record (2026-06-12)
- G1 ✅ 22339ef2 (token-validity module + revocation + effective-close expiry;
  source-grep baseline 140→141 with justification) · G2 ✅ 3f2f6071
  (queue-first reportEvent) · G6 ✅ 6ce4bd8e (LRU eviction on insert failure) ·
  G3 ✅ a1f290cf (keyboard chips + aria-pressed) · G4 ✅ 16d25da0 (offset id
  tiebreak + stale-loadMore guard + api.md order contract) · G5 ✅ 150b74ed
  (similarity language in evidence; dead service_unavailable vocabulary
  pruned across enum/UI/both catalogs) · G7 ✅ cc15c4d5 (registers #1/#3
  RESOLVED with evidence; GET authz comment corrected).
- **Final gates on the completed tree:** tsc 0 · eslint 0/0 · lint:bash
  clean · unit 339 files / 2650 tests PASS · component 71 files / 246 tests
  PASS · production build OK. (One transient tsc EXIT:2 during the parallel
  gate run was a race with `next build` regenerating `.next/types`;
  re-verified clean on the settled tree.)
- GATE_FIXES this cycle: 0 pre-existing gate errors (baseline clean); 3
  in-flight regressions caught and fixed before push (member-delete source
  pin updated+strengthened for the new tx return; monitor terminal-state
  asserts adapted to queue-first drain; source-grep baseline bump).
- **Deploy record (2026-06-12, per-cycle, HEAD 4e7691cf): SUCCESS — all
  three targets in one run of the exact DEPLOY_CMD (exit 0,
  "Deployment complete!" ×3 on worv, auraedu, algo; ZERO `unknown blob`
  events — fifth consecutive clean sequential-language run; auraedu built
  the full language set + worker image; algo stayed app-only per policy).
  HTTPS 200 on test.worv.ai / oj.auraedu.me / algo.xylolabs.com.
  Post-deploy smokes: public subsets green (worv 142✓, algo 142✓,
  auraedu 141✓). Remaining failures: (a) 6 login-gated specs per target —
  no E2E_PASSWORD in this run env (DEFER-ENV-GATES, unchanged); (b) the
  known auraedu tablet-rankings cold-start transient (responsive-layout
  tablet spec; green on worv and algo; /rankings returns HTTP 200 on
  direct fetch post-deploy — same signature as the cycle-3/4/5 records).**
