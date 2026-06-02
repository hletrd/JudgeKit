# Multi-agent review remediation (2026-06-03)

Source: fresh multi-agent review (7 dimension reviewers → 22 candidates → **16
confirmed** after 2-skeptic adversarial verification). Full provenance:
`.context/reviews/multi-agent-2026-06-03/` (gitignored).

Status legend: ✅ done+pushed · 🔧 in progress · ⬜ todo · 🟡 needs decision

---

## CRITICAL

### C1 ⬜ IOI partial scores inflated (worker early-break + truncated denominator)
`judge-worker-rs/src/executor.rs:617` breaks the test loop on the first non-AC
verdict, reporting only the tests it ran. The server computes
`score = passed / results.length` (`src/lib/judge/verdict.ts:46`) using that
**truncated** count — so a 10-test IOI problem that fails test 3 after passing
1–2 scores **2/3 = 66.7% instead of 2/10 = 20%**. Flows to leaderboard, gradebook,
live rank, CSV/JSON export, recruiting results. ICPC is unaffected (AC requires
score==100). The unit test `verdict.test.ts` masks it by hand-building a complete
result array the real worker never sends.

**Correct fix (cross-component; needs a worker rebuild to deploy):**
1. `claim-query.ts` — join the assignment's `scoring_model` into the claim SELECT
   (null assignment / practice → not IOI).
2. `claim/route.ts` + `claimedSubmissionRowSchema` — derive
   `runAllTestCases = scoringModel === "ioi"` and include it in the worker payload.
3. Worker `types.rs` — add `#[serde(default)] run_all_test_cases: bool` to `Submission`
   (default false = current behavior; backward compatible).
4. Worker `executor.rs:617` — `if verdict != Accepted && !submission.run_all_test_cases { break; }`.
5. `verdict.test.ts` — fix the masking test; add a test driving the truncated
   worker shape through the poll route to assert the denominator.
6. Rebuild the judge worker on worker-0 (the flag code is inert until then).

**Trade-off to confirm:** running all tests for IOI is inherent to correct
partial scoring but costs more compute (a TLE submission runs every test to the
limit). Optional immediate harm-reduction (app-only, no worker rebuild): have the
server pass the problem's TRUE total test count as the denominator in
`computeFinalJudgeMetrics` — this kills the over-credit now but UNDER-counts IOI
early-fails (unrun tests treated as failed) until the worker runs all. Decision
needed: ship the conservative server-only interim first, or go straight to the
full worker fix.

---

## HIGH

- H1 ✅ **Cross-instructor write IDOR on PATCH/DELETE /problems/[id]** — `8b6affdd`.
  Added `canManageProblem` (author / groups.view_all / taught-group-linked; public
  ≠ writable) gating both handlers. +5 tests.
- H2 ⬜ **90-day audit-event retention never enforced** — `startAuditEventPruning`
  is a no-op and `pruneSensitiveOperationalData` omits `auditEvents`; the table
  (with candidate PII) grows forever. Add `pruneAuditEvents(now)` + include in the
  maintenance Promise.allSettled + register the schedule.
- H3 ⬜ **Account deletion leaves recruiting-invitation PII** — permanent
  `db.delete(users)` doesn't scrub `recruiting_invitations.{candidateName,
  candidateEmail,ipAddress,metadata}` (userId is `set null`). GDPR erasure gap.
  Scrub/delete invitation PII in the same transaction.
- H4 ⬜ **Stale-claim reclaim leaks the previous worker's active_tasks** — reclaim
  bumps the new worker but never decrements the dead worker's counter → permanent
  phantom capacity loss. Decrement previous owner atomically in `claim-query.ts`.
- H5 ⬜ **Discussion thread list over-fetches all post rows for reply counts**
  (perf) — replace eager `posts` relation with a batched `COUNT(*) GROUP BY thread_id`.
- H6 ⬜ **Fullscreen code-editor overlay has no focus management** (a11y) — add
  role="dialog" aria-modal, focus move-in, focus trap, and focus restore on close.

## MEDIUM

- M1 ⬜ **Co-instructor can transfer group ownership** via PATCH /groups/[id]
  `instructorId` — gate that field on current-owner-or-admin, not co-instructor.
- M2 ⬜ **Assignment PATCH doesn't invalidate the leaderboard ranking cache** —
  add `invalidateRankingCache(assignmentId)` after `updateAssignmentWithProblems`.
- M3 ⬜ **Candidate name/email written unredacted into `audit_events.details`** —
  reference invitation/user id instead, or redact; ensure covered by retention (H2).
- M4 ⬜ **computeContestAnalytics fetches all submission rows (no LIMIT)** (perf) —
  push progression/first-AC aggregation into SQL (window funcs / DISTINCT ON).
- M5 ⬜ **Side-by-side diff distinguishes add/remove by color only** (a11y) — add a
  ± marker / sr-only label per differing row.
- M6 ⬜ **yellow-600 on light bg fails 4.5:1 contrast** (a11y) — use yellow-700/amber-700.

## LOW

- L1 ⬜ **judge /register: no rate limit or dedup** — add a rate-limit bucket +
  upsert/cap by hostname (shared-token-holder DoS / table bloat).
- L2 ⬜ **exam-session GET cross-participant timing leak** — `?userId=` override
  honored on bare `contests.view_analytics`; require a group-manage relationship
  (use `canViewAssignmentSubmissions`, like the sibling participant-timeline route).
- L3 ⬜ **Frozen-window self live-rank ignores score overrides** — overlay
  `score_overrides` in `computeSingleUserLiveRank`, or hide the live-rank badge.

---

## Recommended sequence
1. C1 (critical, but confirm the interim-vs-full approach) + H4 (reliability) — judge core.
2. H2/H3/M3 (data-retention + GDPR + audit PII — they cluster).
3. M1/M2/L2 (authz + cache correctness — clean app-side).
4. H5/M4 (perf), then H6/M5/M6/L3 (a11y/UX), L1 (judge register hardening).
