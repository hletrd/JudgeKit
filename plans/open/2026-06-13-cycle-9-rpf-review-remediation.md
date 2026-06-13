# RPF Cycle 9 — Review Remediation Plan (2026-06-13)

**HEAD planned against:** da6179f3 → review-archive commit 8c05478c (main ==
origin/main, clean tree).
**Source:** `.context/reviews/_aggregate.md` (cycle-9) + 17 lens files.
**Baseline gates:** tsc 0 · eslint 0/0 · lint:bash clean · unit 340 files /
2663 PASS.

Theme (critic §theme): **finish the deterministic-listing-order sweep.** Cycle-7
(commit 4cf6dfe0) propagated a unique-`id` tiebreak to "7 sibling routes" via a
source-grep contract test (`listing-order-tiebreak.test.ts`) that is an explicit
5-route allow-list. Three offset-paged listings in the same class slipped the
allow-list and still order by a non-unique column. No new feature surface.

Repo policy for every commit below: GPG-signed (`git commit -S`), conventional
+ gitmoji, NO Co-Authored-By, fine-grained (one fix per commit),
`git pull --rebase` before each push, no `--no-verify`. Tests red-first.

---

## G1 — AGG9-4: extend the listing-order contract test (test gap, High) — RED FIRST
**File:** `tests/unit/api/listing-order-tiebreak.test.ts`.
**Change:** add three tailored assertions (the existing harness asserts a fixed
`desc(createdAt), desc(id)` string; the new routes use different orders, so
assert the *presence of the id tiebreak* and the *absence of the single-key
order* per route):
- `code-snapshots/[userId]/route.ts` → must contain
  `asc(codeSnapshots.createdAt), asc(codeSnapshots.id)`; must NOT match
  `orderBy\(asc\(codeSnapshots\.createdAt\)\)` alone.
- `recruiting-invitations.ts` → must contain
  `recruitingInvitations.createdAt, recruitingInvitations.id`; must NOT keep
  `orderBy\(recruitingInvitations\.createdAt\)` as the sole clause.
- `accepted-solutions/route.ts` → must contain `desc(submissions.id)`; the
  `newest` branch must NOT be `[desc(submissions.submittedAt)]` alone.
All three RED on current source. Commit the test FIRST so each subsequent fix
turns its assertion GREEN (bisectable).

## G2 — AGG9-1: code-snapshot evidence timeline id tiebreak (MEDIUM, High) — PRINCIPAL FIX
**File:** `src/app/api/v1/contests/[assignmentId]/code-snapshots/[userId]/route.ts:54`.
**Change:** `.orderBy(asc(codeSnapshots.createdAt))` →
`.orderBy(asc(codeSnapshots.createdAt), asc(codeSnapshots.id))`. `id` is the
nanoid PK; snapshots are POSTed one row at a time with `created_at` defaulting to
`new Date()`, so same-ms collisions are common; without a unique tiebreak the
paged anti-cheat evidence timeline drops/dups rows at page seams. Turns the G1
code-snapshots assertion GREEN.

## G3 — AGG9-2: recruiting-invitation list id tiebreak (MEDIUM, High)
**File:** `src/lib/assignments/recruiting-invitations.ts:272`.
**Change:** `.orderBy(recruitingInvitations.createdAt)` →
`.orderBy(recruitingInvitations.createdAt, recruitingInvitations.id)`. Bulk CSV
import creates many same-instant rows; offset paging (limit ≤500) drops/dups at
seams without the unique tiebreak. Turns the G1 recruiting assertion GREEN.

## G4 — AGG9-3: accepted-solutions sort id tiebreak in all 3 branches (MEDIUM, Medium)
**File:** `src/app/api/v1/problems/[id]/accepted-solutions/route.ts:54-59`.
**Change:** append `desc(submissions.id)` as the final clause of every
`orderByClause` branch (`newest`, `shortest`, `fastest`). Public solution browser
is offset-paged; equal-key rows reorder across pages otherwise. Turns the G1
accepted-solutions assertion GREEN.

---

## Deferred register (cycle-9) — findings NOT implemented this cycle
All four cycle-9 findings (AGG9-1/2/3 correctness + AGG9-4 test gap) are
SCHEDULED above (G1–G4) — none deferred. The register below is the carried set
whose exit criteria did NOT fire this cycle (severity preserved at origin):

| ID | Finding (file+line) | Sev/Conf | Reason still deferred | Exit criterion |
|---|---|---|---|---|
| AGG8-2 | heartbeat-gap scan `limit(5000)` ordered `desc(createdAt)` only (`anti-cheat/route.ts:316-325`) | LOW/Medium | Bounded NON-paged scan (not a paged listing); heartbeats ~60 s apart so a same-ms collision at the 5000th row is near-impossible; gap detection is time-based and tolerant of a one-interval shift. The gap-scan block was NOT edited this cycle. **G2 (code-snapshots) is a DIFFERENT route and does not reopen this.** | next edit to the heartbeat-gap scan block, OR an incident where a detected gap boundary is disputed |
| P6-1 | TS similarity fallback normalize/n-gram phase neither time-slices nor honors abort (`code-similarity.ts:266-275`) | LOW/Medium (RISK) | Bounded by 500-row + 10k-literal caps; Rust sidecar is the default engine; fallback staff-triggered and rare; `runSimilarityCheckTS` NOT edited this cycle | any edit to `runSimilarityCheckTS`; or an incident implicating app-server event-loop stalls during a fallback run |

**Deferral-rule compliance:** AGG8-2 and P6-1 are LOW severity, NOT
security/correctness/data-loss on a *paged* surface (AGG8-2 is a bounded non-paged
scan; P6-1 is a perf RISK). No High/Medium correctness or security finding is
deferred — all four cycle-9 findings are scheduled G1–G4. Deferred work remains
bound by repo policy when picked up.

### Carried from earlier cycles (exit criteria re-checked; unchanged this cycle)
See `_aggregate.md` "Cross-cycle carried register" — re-materialized for the
planning record (severities preserved at origin): AGG5-7 (judge-worker-rs
cosmetics), AGG5-8 (similarity rerun first-flagged reset), AGG3-7
(run_remote_build log overwrite), DES3-1 (exam-deadline-sync politeness), ST5-5
(countdown client clock), TA3-1-followup/DES4-4 (timeline extension events),
JA-clarity (pre-test language preview), DEFER-ENV-GATES (login-gated E2E +
browser a11y), CI-RESTORE (wire RESTORE_DATABASE_URL into CI), C3-AGG-5
(deploy-docker.sh SSH-helpers extraction), IN2-2 (pre-start accommodations), A8-1
(optional token-values constructor — hardening direction, NOT a deferred
finding), and the cycle-1 origin set. None had its exit criterion fire this cycle
(no Rust edit, no similarity-engine edit, no gap-scan edit, no deploy-script SSH
edit, no provisioned staging server/browser, no CI workflow edit, no 5th
token-insert site).

---

## Plan archival done in this planning pass
- `plans/open/2026-06-13-cycle-8-rpf-review-remediation.md` → `plans/done/`
  (G1 done+deployed at 53f16e77; its deferred rows re-materialized above).
- Standing plans (`2026-04-14-master-review-backlog.md`, `2026-04-17-*`, older
  cycle-N plans still in `plans/open` with tracked deferrals) remain open — not
  cycle-9-scoped.

## Recommended sequence
1. G1 (extend contract test, RED) → 2. G2 (code-snapshots tiebreak) →
3. G3 (recruiting-invitation tiebreak) → 4. G4 (accepted-solutions tiebreak).
Gate after each item; fine-grained GPG-signed commit; `git pull --rebase` + push;
then DEPLOY_CMD (per-cycle worv + algo, detached + polled in-turn; smoke
https://test.worv.ai/ and https://algo.xylolabs.com/ for HTTP 200).

---

## Completion record (filled during implementation)
- G1 ✅ 2d542442 — extended `listing-order-tiebreak.test.ts` with 3 tailored
  assertions (code-snapshots / recruiting-invitations / accepted-solutions); all
  3 RED on prior source, the 5 existing cycle-7 cases stayed GREEN.
- G2 ✅ 883c42aa — `code-snapshots/[userId]/route.ts` orderBy →
  `(asc(createdAt), asc(id))`.
- G3 ✅ 53826cff — `recruiting-invitations.ts` list orderBy →
  `(createdAt, id)`.
- G4 ✅ 20d67c03 — `accepted-solutions/route.ts` all 3 sort branches end in
  `desc(submissions.id)`.
**Final gates on the completed tree:** tsc 0 · eslint 0/0 · lint:bash clean ·
unit 340 files / 2666 tests PASS (+3 contract cases) · production build OK.
**GATE_FIXES this cycle:** 0 pre-existing gate errors (baseline clean); 0
suppressions.
**Deploy record:** (filled after DEPLOY_CMD below.)
