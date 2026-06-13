# RPF Cycle 8 — Review Remediation Plan (2026-06-13)

**HEAD planned against:** 72245a16 (main == origin/main, clean tree).
**Source:** `.context/reviews/_aggregate.md` (cycle-8) + 17 lens files.
**Baseline gates:** tsc 0 · eslint 0/0 · lint:bash clean · unit 340 files / 2661 PASS.

Theme (from critic §theme): **finish enumerating the token-lifecycle mutation
points.** Cycle-6 fixed the validity rule + roster revoke; cycle-7 fixed the
schedule-edit sync + invite re-issue; cycle-8 fixes the one CREATION site both
missed — access-code redemption. No new feature surface.

Repo policy for every commit below: GPG-signed (`git commit -S`), conventional
+ gitmoji, NO Co-Authored-By, fine-grained (one fix per commit),
`git pull --rebase` before each push, no `--no-verify`. Tests red-first.

---

## G1 — AGG8-1: canonical token expiry at the access-code redeem path (MEDIUM, High) — PRINCIPAL FIX
**File:** `src/lib/assignments/access-codes.ts` (`redeemAccessCode`, the token
insert at line 184-192).
**Change:**
- Import `contestAccessTokenExpiry` from
  `@/lib/assignments/contest-access-tokens`.
- Replace `expiresAt: assignment.deadline` (line 191) with
  `expiresAt: contestAccessTokenExpiry(assignment)`. The loaded `assignment`
  already selects both `deadline` and `lateDeadline` (lines 119-120), so the
  helper's `{ deadline, lateDeadline }` shape is satisfied. Equivalent to the
  `effectiveClose` already computed at line 135 for the join gate, but routed
  through the single owner so it cannot drift again.
**Red-first test (TE8-1):** `tests/unit/assignments/access-codes.test.ts` — add a
redeem case with `deadline=T`, `lateDeadline=T+1h`, capture the
`insert(contestAccessTokens).values(...)` argument, assert
`expiresAt === lateDeadline` (T+1h). Red on current code (would be T). Add a
`lateDeadline=null` case asserting `expiresAt === deadline` to pin the `?? `
branch. Existing redeem fixtures set `lateDeadline: null` (lines 154, 213) — the
new fixture is what exercises the divergence.
**Structural follow-on (A8-1, recommended within this commit or a sibling
commit):** to prevent a 4th divergence, optionally add
`buildContestAccessTokenValues({ assignmentId, userId, now, ipAddress,
assignment })` to `contest-access-tokens.ts` returning the full insert payload
with `expiresAt` derived; route both the invite insert and the access-code
insert through it. If the constructor is added, keep it fine-grained as its own
refactor commit AFTER the value fix lands (so the correctness fix is isolated and
bisectable). The minimal one-line value fix is the required scope; the
constructor is a no-future-drift hardening, do it only if it stays clean.
**Doc (DOC8-1, optional, LOW):** if the constructor lands, note in the
access/exam-integrity doc that all token creation paths derive expiry from the
effective close.
**Status:** ☐ pending

---

## Deferred register (cycle-8) — findings NOT implemented this cycle
Severity preserved; the one correctness/consistency finding (AGG8-1) is
SCHEDULED above (not deferred). Only LOW/RISK items are deferred, under the same
terms cycles 6–7 used.

| ID | Finding (file+line) | Sev/Conf | Reason for deferral | Exit criterion |
|---|---|---|---|---|
| AGG8-2 | Heartbeat-gap scan `limit(5000)` ordered by `desc(createdAt)` only — no `id` tiebreak (`src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:316-325`) | LOW/Medium | Bounded scan, NOT a paged listing (correctly out of cycle-7 G2 scope); heartbeats ~60 s apart so a same-second collision at the exact 5000th row is near-impossible; gap detection is time-based and a one-interval shift at the cap boundary is immaterial. No edit to the gap scan this cycle. | Next edit to the heartbeat-gap scan block, OR an incident where a detected gap boundary is disputed and traced to the cap order |
| P6-1 | TS similarity fallback normalize/n-gram grouping phase neither time-slices nor honors the abort signal (`src/lib/assignments/code-similarity.ts:266-275`) | LOW/Medium (RISK) | Bounded by the 500-row + 10k-literal caps; Rust sidecar is the default engine; fallback is staff-triggered and rare; `runSimilarityCheckTS` not edited this cycle | Any edit to `runSimilarityCheckTS`; or an incident implicating app-server event-loop stalls during a fallback run |

**Deferral-rule compliance:** AGG8-2 and P6-1 are LOW severity. Neither is a
security/correctness/data-loss finding (AGG8-2 is a deterministic-ordering
nicety on a non-paged bounded scan; P6-1 is a perf RISK). No High/Medium
correctness or security finding is deferred — AGG8-1 is scheduled above.
Deferred work remains bound by repo policy when picked up (GPG-signed
conventional+gitmoji commits, no `--no-verify`, no force-push, tests per
AGENTS.md).

### Carried from earlier cycles (exit criteria re-checked; unchanged this cycle)
See `_aggregate.md` "Cross-cycle carried register" — re-materialized here for the
planning record (severities preserved at origin):
AGG5-7 (judge-worker-rs cosmetics), AGG5-8 (similarity rerun first-flagged
reset), AGG3-7 (run_remote_build log overwrite), DES3-1 (exam-deadline-sync
politeness), ST5-5 (countdown client clock), TA3-1-followup/DES4-4 (timeline
extension events), JA-clarity (pre-test language preview), DEFER-ENV-GATES
(login-gated E2E + browser a11y), CI-RESTORE (wire RESTORE_DATABASE_URL into CI),
C3-AGG-5 (deploy-docker.sh SSH-helpers extraction), IN2-2 (pre-start
accommodations), and the cycle-1 origin set. None had its exit criterion fire
this cycle (no Rust edit, no similarity-engine edit, no gap-scan edit, no
deploy-script SSH edit, no provisioned staging server/browser, no CI workflow
edit).

---

## Plan archival done in this planning pass
- `plans/open/2026-06-13-cycle-7-rpf-review-remediation.md` → `plans/done/`
  (G1–G4 all ✅ done+pushed at 840f2183; its deferred rows re-materialized into
  the registers above).
- Standing plans (`2026-04-14-master-review-backlog.md`, `2026-04-17-*`, older
  cycle-N plans still in `plans/open` with tracked deferrals) remain open — not
  cycle-8-scoped.

## Recommended sequence
1. G1 (canonical token expiry at the access-code redeem path; red-first test).
Gate after the item; fine-grained signed commit; pull --rebase + push; then
DEPLOY_CMD (per-cycle worv + algo, detached + polled in-turn).

---

## Completion record (filled during implementation)
- G1: ☐
**Final gates on the completed tree:** (filled after implementation)
**Deploy record:** (filled after DEPLOY_CMD)
