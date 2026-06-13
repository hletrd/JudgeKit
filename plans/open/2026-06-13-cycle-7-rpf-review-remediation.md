# RPF Cycle 7 — Review Remediation Plan (2026-06-13)

**HEAD planned against:** 0472b007 (main == origin/main, clean tree).
**Source:** `.context/reviews/_aggregate.md` (cycle-7) + 17 lens files.
**Baseline gates:** tsc 0 · eslint 0/0 · lint:bash clean · unit 339 files / 2650 PASS.

Theme (from critic §1/§4): **finish the job** — cycle-6 fixed the canonical
case of two defect classes and one half of a lifecycle; cycle-7 propagates
them to every sibling/mutation point. No new feature surface.

Repo policy for every commit below: GPG-signed (`git commit -S`), conventional
+ gitmoji, NO Co-Authored-By, fine-grained (one fix per commit),
`git pull --rebase` before each push, no `--no-verify`. Tests red-first where
stated.

---

## G1 — AGG7-3: complete the contest access-token expiry lifecycle (MEDIUM, High) — PRINCIPAL FIX
**Files:** `src/lib/assignments/contest-access-tokens.ts` (new helper),
`src/lib/assignments/management.ts` (call inside the schedule-edit tx),
`src/app/api/v1/contests/[assignmentId]/invite/route.ts` (onConflictDoUpdate).
**Change:**
- Add `syncContestAccessTokenExpiry(tx, assignmentId, { deadline, lateDeadline })`
  to the contest-access-tokens module: `UPDATE contest_access_tokens SET expires_at = (lateDeadline ?? deadline ?? NULL) WHERE assignment_id = @assignmentId`.
  Single owner of the rule, next to `contestAccessTokenExpiry`.
- Call it inside `updateAssignmentWithProblems`' transaction
  (management.ts:291-309) AFTER the assignment UPDATE, using the input's
  effective close — mirrors the in-tx `revokeContestAccessTokensForGroup`
  pattern. This also retro-repairs pre-cycle-6 `deadline`-stamped rows on the
  next edit (AD7-2 — no migration needed).
- Change the invite-route token insert from `onConflictDoNothing` to
  `onConflictDoUpdate` setting `expiresAt: contestAccessTokenExpiry(assignment)`
  (leave `redeemedAt`/`ipAddress` untouched) so re-invites refresh a stale
  expiry (CR7-3).
**Red-first tests (TE7-3):** schedule-edit sync — extend moves expiry later,
shorten moves earlier, clear-deadline → NULL; invite re-issue refreshes a stale
`expiresAt`. Pin the in-tx call (source/behavioral).
**Status:** ☐ pending

## G2 — AGG7-2: offset/cap id tiebreak across the 7 sibling listings (LOW-MEDIUM, High)
**Files + lines:**
- `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:292` → `desc(createdAt), desc(id)`.
- `src/app/api/v1/admin/audit-logs/route.ts:269` (paged) + `:219` (CSV cap) → `desc(createdAt), desc(id)`.
- `src/app/api/v1/admin/login-logs/route.ts:129` (paged) + `:93` (CSV cap) → `desc(createdAt), desc(id)`.
- `src/app/api/v1/users/route.ts:46` → `desc(createdAt), desc(id)`.
- `src/app/api/v1/files/route.ts:197` → `desc(createdAt), desc(id)`.
- `src/app/api/v1/problems/route.ts:61` + `:131` → `desc(createdAt), desc(id)`.
**Tests (TE7-1, red-first):** per-route `orderBy` arity pin (length 2), mirroring
`submissions.route.test.ts:758-759`. Use existing test files where present
(`anti-cheat-get-behavioral.test.ts`, `users.route.test.ts`,
`problems.route.test.ts`, `files-by-id.route.test.ts`) or add focused ones.
**Doc (DOC7-2/V7-3):** document `(createdAt desc, id desc)` order for the
anti-cheat GET in `docs/api.md:824-840`.
**Commit grouping:** can be a few fine-grained commits (e.g. anti-cheat,
admin-logs, generic-lists) rather than one giant commit.
**Status:** ☐ pending

## G3 — AGG7-1: anti-cheat dashboard paging fidelity (MEDIUM, High)
**File:** `src/components/contest/anti-cheat-dashboard.tsx`.
**Change (mirror the timeline's cycle-6 pattern, adapted to preserve-tail UX):**
- Add a `fetchSeqRef` bumped at the start of `fetchEvents`; capture it in
  `loadMore` and discard the response if it changed (stale-guard).
- Poll merge: build an id-union — fresh first page first, then every previous
  row whose id is not in the fresh page (no seam loss); `setOffset(merged.length)`.
  Keep it O(page) using a Set of fresh-page ids (P7-2).
- `loadMore` append: id-dedupe against current rows (Set).
**Tests (TE7-2):** component tests — (a) poll merge after loadMore loses no
previously-loaded row; (b) loadMore after a poll reset produces no duplicate
ids; (c) stale in-flight loadMore is discarded. Mirror
`participant-anti-cheat-timeline.test.tsx`.
**Status:** ☐ pending

## G4 — AGG7-4: correct the anti-cheat POST eventType doc enum (LOW-MEDIUM, High)
**File:** `docs/api.md:813-817`.
**Change:** replace the eventType enum with the 6 CLIENT types
(`tab_switch|copy|paste|blur|contextmenu|heartbeat`) and add a note that
`ip_change` / `code_similarity` / `submission_stale_heartbeat` are
server-generated and rejected from a contestant POST. Source of truth:
`src/lib/anti-cheat/client-events.ts:18-25`.
**Status:** ☐ pending

---

## Deferred register (cycle-7) — findings NOT implemented this cycle
Severity preserved; no security/correctness/data-loss finding is deferred
(AGG7-1…4 are all scheduled above). Only the standing perf RISK is deferred,
under the same terms cycle-6 used.

| ID | Finding (file+line) | Sev/Conf | Reason for deferral | Exit criterion |
|---|---|---|---|---|
| P6-1 | TS similarity fallback's normalize/n-gram phase neither time-slices nor honors the abort signal (`code-similarity.ts:266-275`) | LOW/Medium (RISK) | Bounded by the 500-row + 10k-literal caps; Rust sidecar is the default engine; fallback is staff-triggered and rare; no similarity-engine edit this cycle | Any edit to `runSimilarityCheckTS`; or an incident implicating app-server event-loop stalls during a fallback run |

### Carried from earlier cycles (exit criteria re-checked; unchanged this cycle)
See `_aggregate.md` "Cross-cycle carried register" — re-materialized here for
the planning record (severities preserved at origin):
AGG5-7 (judge-worker-rs cosmetics), AGG5-8 (similarity rerun first-flagged
reset), AGG3-7 (run_remote_build log overwrite), DES3-1 (exam-deadline-sync
politeness), ST5-5 (countdown client clock), TA3-1-followup/DES4-4 (timeline
extension events), JA-clarity (pre-test language preview), DEFER-ENV-GATES
(login-gated E2E + browser a11y), CI-RESTORE (wire RESTORE_DATABASE_URL into
CI), C3-AGG-5 (deploy-docker.sh SSH-helpers extraction), IN2-2 (pre-start
accommodations), and the cycle-1 origin set. None had its exit criterion fire
this cycle (no Rust edit, no similarity-engine edit, no deploy-script SSH
edit, no provisioned staging server/browser, no CI workflow edit).

Deferred work remains bound by repo policy when picked up (GPG-signed
conventional+gitmoji commits, no `--no-verify`, no force-push, tests per
AGENTS.md).

---

## Plan archival done in this planning pass
- `plans/open/2026-06-12-cycle-6-rpf-review-remediation.md` → `plans/done/`
  (G1–G7 all ✅ done+pushed; three-target deploy success recorded at 4e7691cf;
  its deferred rows re-materialized into the registers above).
- Standing plans (`2026-04-14-master-review-backlog.md`, `2026-04-17-*`, the
  older cycle-N plans still in `plans/open` with tracked deferrals) remain open
  — not cycle-7-scoped.

## Recommended sequence
1. G1 (token lifecycle; red-first) — principal fix.
2. G2 (offset id tiebreaks + doc order; red-first arity pins).
3. G3 (dashboard paging fidelity; component tests).
4. G4 (doc enum correction).
Gates after each item; fine-grained signed commits; pull --rebase + push per
iteration; then DEPLOY_CMD (per-cycle, detached + polled in-turn).

---

## Completion record
(to be filled during PROMPT 3)
