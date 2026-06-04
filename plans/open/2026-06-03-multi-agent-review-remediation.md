# Multi-agent review remediation (2026-06-03)

Source: fresh multi-agent review (7 dimension reviewers → 22 candidates → **16
confirmed** after 2-skeptic adversarial verification). Full provenance:
`.context/reviews/multi-agent-2026-06-03/` (gitignored).

Status legend: ✅ done+pushed · 🔧 in progress · ⬜ todo · 🟡 needs decision

---

## CRITICAL

### C1 ✅ IOI partial scores inflated (worker early-break + truncated denominator) — FIXED + DEPLOYED
Fixed in `c3a29e8a`: server signals `runAllTestCases = scoringModel === "ioi"`;
worker `run_all_test_cases` (serde default false) only fail-fast-breaks when false.
Deployed 2026-06-04: app live on algo (server side) + judge worker rebuilt on
worker-0 (image a5442080, healthy) — fully active. ICPC/practice keep fail-fast.
Original report below.

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
- H2 ✅ **90-day audit-event retention never enforced** — `39420539`. Added
  `pruneAuditEvents(now)` + included it in the `pruneSensitiveOperationalData`
  Promise.allSettled (widened `batchedDelete`'s table union to `auditEvents`). +test.
- H3 ✅ **Account deletion leaves recruiting-invitation PII** — `16212175`. Permanent
  delete now scrubs `recruiting_invitations.{candidateName,candidateEmail,ipAddress,
  metadata}` in the same `execTransaction`, BEFORE the FK `set null` cascade. +test.
- H4 ✅ **Stale-claim reclaim leaks the previous worker's active_tasks** — `ed73a23b`.
  Added a `prev_worker_release` CTE that decrements the prior owner's `active_tasks`
  (`GREATEST(-1,0)`, only when prev≠new and a claim happened) atomically. +guard test.
- H5 ✅ **Discussion thread list over-fetches all post rows for reply counts**
  (perf) — `90558b22`. `listReplyCounts` batched `COUNT(*) GROUP BY thread_id`;
  4 list fns attach `replyCount` instead of eager `posts`; 2 consumers updated. +test.
- H6 ✅ **Fullscreen code-editor overlay has no focus management** (a11y) — `c6cdfbe7`.
  Added role="dialog" aria-modal aria-label, focus move-in, Tab/Shift-Tab trap, and
  focus restore on close. +guard test.

## MEDIUM

- M1 ✅ **Co-instructor can transfer group ownership** via PATCH /groups/[id]
  `instructorId` — `b6e38593`. Gated the `instructorId` field on
  current-owner-or-`groups.view_all`, not the general co-instructor edit gate. +test.
- M2 ✅ **Assignment PATCH doesn't invalidate the leaderboard ranking cache** —
  `43b7cda0`. Calls `invalidateRankingCache(assignmentId)` after the update. +guard test.
- M3 ✅ **Candidate name/email written unredacted into `audit_events.details`** —
  `a951da85`. Audit event now references `invitation.id` only (no raw name/email);
  covered by retention (H2). +test.
- M4 ✅ **computeContestAnalytics fetches all submission rows (no LIMIT)** (perf) —
  `84c55ce7`. First-AC via `DISTINCT ON (user,problem)`; progression via window
  `MAX(score) OVER (... ROWS … 1 PRECEDING)` filtered to raw record-breakers. +guard test.
- M5 ✅ **Side-by-side diff distinguishes add/remove by color only** (a11y) — `604646bb`.
  Added a `+`/`-` marker column to both panels. +guard test.
- M6 ✅ **yellow-600 on light bg fails 4.5:1 contrast** (a11y) — `22141e82`.
  `text-yellow-700` (keeps `dark:text-yellow-400`). +guard test.

## LOW

- L1 ✅ **judge /register: no rate limit or dedup** — `0b084f4b`. IP-keyed
  `consumeApiRateLimit(request, "judge:register")` before the insert. +test.
- L2 ✅ **exam-session GET cross-participant timing leak** — `e7e905ca`. `?userId=`
  override now gated by `canViewAssignmentSubmissions` (removed the bare
  `contests.view_analytics` path), matching the participant-timeline route. +test.
- L3 ✅ **Frozen-window self live-rank ignores score overrides** — `15b37782`.
  IOI `computeSingleUserLiveRank` LEFT JOINs `score_overrides` and overlays the
  override (presence test; no late penalty on top), agreeing with the board. +guard test.
  (ICPC overlay still deferred — N7-C7-ICPC: an ICPC override has no AC timestamp.)

---

## Recommended sequence
1. C1 (critical, but confirm the interim-vs-full approach) + H4 (reliability) — judge core.
2. H2/H3/M3 (data-retention + GDPR + audit PII — they cluster).
3. M1/M2/L2 (authz + cache correctness — clean app-side).
4. H5/M4 (perf), then H6/M5/M6/L3 (a11y/UX), L1 (judge register hardening).
