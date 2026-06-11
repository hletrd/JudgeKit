# Instructor / Exam-and-Contest Organizer Review — JudgeKit

Reviewer perspective: an instructor running recruiting tests, graded exams, and ranked
contests on this platform. Focus on correctness, fairness, and configuration footguns.
Confirmed findings were verified against source (and, where noted, by executing the real
Zod schema against the real client payload). Suspected findings are flagged as such.

## Top risks for production use (ranked)

1. **Editing a contest is completely broken — every save returns HTTP 400.** The contest/
   assignment edit form always sends `freezeLeaderboardAt`, `showResultsToCandidate`, and
   `hideScoresFromCandidates`, but the PATCH validator (`assignmentPatchSchema`) is `.strict()`
   and does not declare those keys, so Zod rejects the whole request. **CONFIRMED by running
   the real schema against the real payload.** An instructor who creates a contest can never
   fix a typo, add a problem, change the deadline, or adjust anti-cheat afterward through the
   UI. Severity: Critical. Confidence: High.

2. **Even if (1) is fixed, saving a contest silently wipes the leaderboard freeze and the
   candidate-visibility flags.** The PATCH handler rebuilds the mutation input without ever
   reading `freezeLeaderboardAt`, `showResultsToCandidate`, or `hideScoresFromCandidates`,
   and `updateAssignmentWithProblems` writes them as `null`/`false`. So the moment editing is
   un-blocked, any edit during a live ranked contest un-freezes the leaderboard and flips
   recruiting result-visibility back to hidden. Severity: High (fairness). Confidence: High.

3. **`anonymousLeaderboard` is a dead toggle — never persisted by any code path.** The column
   exists and the leaderboard route reads it, but no create/update/route ever writes it. An
   instructor who turns on "anonymous leaderboard" for a non-exam ranked assignment gets no
   effect. (Exam-mode boards are force-anonymized regardless, which masks the bug.) Severity:
   Medium. Confidence: High.

4. **No validation that `freezeLeaderboardAt` falls inside the contest window.** A freeze time
   set after the deadline never engages; a freeze time before the start freezes the board for
   the entire contest. Nothing warns the organizer. Severity: Medium (fairness footgun).
   Confidence: High.

5. **`enableAntiCheat` default is inconsistent across creation paths** (quick-create defaults
   `true`; the general form defaults `false`), so whether proctoring is on depends on which
   button the instructor used. Severity: Medium. Confidence: High.

---

## Findings by area

### A. Assessment configuration (exams / contests)

**A1 — CONFIRMED — Critical — Contest/assignment edit always 400s.**
`src/lib/validators/assignments.ts:122-136` defines `assignmentPatchSchema` as `.strict()`
without `freezeLeaderboardAt`, `showResultsToCandidate`, or `hideScoresFromCandidates`. The
edit dialog at `src/app/(public)/groups/[id]/assignment-form-dialog.tsx:251-266` sends all
three keys on **every** submit (contest and plain assignment alike), e.g.
`freezeLeaderboardAt: examMode !== "none" ? parseDateTimeInput(...) : null`. The handler
(`.../[assignmentId]/route.ts:48`) runs this schema via `createApiHandler`, and
`src/lib/api/handler.ts:161-170` returns 400 on `safeParse` failure.

Verified empirically by executing a faithful replica of `assignmentPatchSchema` (Zod 4.3.6,
the version in `package.json`) against the exact contest-edit payload:
`unrecognized_keys: "freezeLeaderboardAt", "showResultsToCandidate", "hideScoresFromCandidates"`,
`success: false`.

Failure scenario: an instructor builds a midterm contest, then realizes problem 3 has the
wrong point value. They open the edit dialog, change it, hit Save → "assignmentUpdateFailed"
toast, no way forward through the UI. There is no other PATCH route for assignment settings.
No test exercises this round-trip (`tests/` references the schema only for unrelated cases),
so CI does not catch it.

Fix: add the three fields to `assignmentPatchSchema`:
```
freezeLeaderboardAt: z.number().int().nullable().optional(),
showResultsToCandidate: z.boolean().optional(),
hideScoresFromCandidates: z.boolean().optional(),
```
and add a route/integration test that PATCHes a contest with these fields and asserts 200 +
preserved values.

**A2 — CONFIRMED — High — Edit silently wipes freeze + visibility flags.**
`.../[assignmentId]/route.ts:128-163` constructs `parsedInput` for `assignmentMutationSchema`
from `body` + the existing `assignment`, but omits `freezeLeaderboardAt`,
`showResultsToCandidate`, and `hideScoresFromCandidates` entirely. `assignmentMutationSchema`
defaults the latter two to `false` (validators:37-38) and treats freeze as absent.
`updateAssignmentWithProblems` then writes `freezeLeaderboardAt: input.freezeLeaderboardAt ?
... : null` (`src/lib/assignments/management.ts:298`) and
`showResultsToCandidate/hideScoresFromCandidates: ... ?? false` (lines 300-301).

So this is a second, independent bug behind A1: even after A1 is fixed by adding the keys to
the strict schema, the handler still must thread them into `parsedInput` (and read the
existing value as the fallback, like it does for `startsAt`/`deadline`). Otherwise the first
successful edit of a live ranked contest un-freezes the board mid-contest and a recruiting
edit re-hides results from candidates.

Failure scenario (ICPC contest): leaderboard is frozen at T-1h per policy. During the freeze
window the organizer edits an announcement-adjacent setting; the freeze field is dropped →
board un-freezes → all teams see live standings for the final hour. Contest integrity gone.

Fix: in the PATCH handler, add to the `assignmentMutationSchema.safeParse({...})` object:
```
freezeLeaderboardAt: body.freezeLeaderboardAt !== undefined
  ? body.freezeLeaderboardAt
  : assignment.freezeLeaderboardAt ? assignment.freezeLeaderboardAt.valueOf() : null,
showResultsToCandidate: body.showResultsToCandidate ?? assignment.showResultsToCandidate ?? false,
hideScoresFromCandidates: body.hideScoresFromCandidates ?? assignment.hideScoresFromCandidates ?? false,
```

**A3 — CONFIRMED — Medium — `anonymousLeaderboard` is never written.**
Schema column `anonymousLeaderboard` (`schema.pg.ts:347`, default false) is read at
`src/app/api/v1/contests/[assignmentId]/leaderboard/route.ts:68` but is absent from
`assignmentMutationSchema`, from `createAssignmentWithProblems` (management.ts:192-212), from
`updateAssignmentWithProblems` (management.ts:286-304), and from every route. A grep for
write paths returns only the schema definition and the read. So the value is permanently the
DB default. For exam-mode boards the leaderboard route force-anonymizes anyway
(`isExamMode` term), which hides the symptom — but a ranked, non-exam `assignment` board (or
any future use that relies on the toggle alone) silently leaks participant names. Severity
Medium because exam force-anonymization masks the common case.
Fix: add `anonymousLeaderboard` to the mutation schema + both management writers, or remove
the column and the read to avoid a misleading UI toggle.

**A4 — CONFIRMED — Medium — No cross-field validation for `freezeLeaderboardAt`.**
`assignmentMutationSchema.superRefine` (validators:44-114) validates start<deadline and
deadline<=lateDeadline, exam-mode required fields, and clears late fields for exams — but
never validates `freezeLeaderboardAt` against `startsAt`/`deadline`. An organizer can set
freeze after the deadline (freeze never triggers; students see live standings to the end) or
before the start (board frozen the entire contest). The auto-unfreeze logic in
`leaderboard.ts:68-74` anchors unfreeze to lateDeadline/deadline, so a freeze-after-deadline
is simply inert, with no warning. Fix: in `superRefine`, when examMode != none and
`freezeLeaderboardAt` is set, require `startsAt <= freezeLeaderboardAt < (deadline ?? +inf)`.

**A5 — CONFIRMED — Medium — Anti-cheat default differs by creation path.**
`quick-create/route.ts:20` → `enableAntiCheat: z.boolean().default(true)`. The general form
defaults the checkbox to off and `assignmentMutationSchema` defaults `enableAntiCheat` to
`false` (validators:36). Two instructors creating "the same" recruiting contest via different
entry points get different proctoring posture. Pick one default (recommend the safer `true`
for recruiting/exam modes) and document it in the form.

**A6 — Strength.** Submission-window enforcement is sound. `validateAssignmentSubmission`
(`src/lib/assignments/submissions.ts:226-245`) blocks submissions before `startsAt` and after
`effectiveClose = lateDeadline ?? deadline ?? null`, using DB server time
(`getDbNowUncached`) to avoid app/DB clock skew. Windowed exams additionally enforce
`personalDeadline < NOW()` both in the validator (line 286) and at insert time in SQL
(`src/app/api/v1/submissions/route.ts:350`). Admin-level capability holders bypass via
`now = 0` (line 224), which is the intended break-glass.

### B. Grading, results & leaderboard correctness

**B1 — Strength — Gradebook / CSV grade export / leaderboard / contest export agree on score
overrides (IOI).** The gradebook aggregation
(`src/lib/assignments/submissions.ts:690-730`) overlays `score_overrides` by
`userId:problemId`; the CSV grade export reuses this via `getAssignmentStatusRows`
(`.../export/route.ts:48`); the contest leaderboard overlays the same overrides for IOI
(`contest-scoring.ts:289-402`); and the contest CSV/JSON export calls the same
`computeContestRanking` (`contests/[assignmentId]/export/route.ts:60`). The override upsert/
delete route invalidates the ranking cache (`overrides/route.ts:128,216`). This is the area
flagged for past bugs and it is now consistent across surfaces for IOI.

**B2 — CONFIRMED (documented, intentional) — Medium — ICPC ignores score overrides; live
rank ignores them entirely.** `contest-scoring.ts:355-356` deliberately skips overrides for
ICPC (no AC timestamp to map onto), and `computeSingleUserLiveRank` (leaderboard.ts:209-215)
overlays no overrides at all for either model. The frozen-board live rank shown to a student
can therefore disagree with the authoritative override-aware standings. This is well
documented as deferred, but from an organizer's seat it is still a real footgun: overriding a
score in an ICPC contest changes the gradebook total but not the leaderboard solved-count/
rank. Recommend surfacing a UI warning ("overrides do not affect ICPC ranking") until the
product decision lands.

**B3 — SUSPECTED — Low — ICPC single-user live-rank penalty uses absolute epoch minutes.**
`leaderboard.ts:168` computes `EXTRACT(EPOCH FROM us.first_ac_at)::bigint / 60 + 20 *
wrong_before_ac`, i.e. minutes since 1970, whereas the main board's `computeIcpcPenalty`
(contest-scoring.ts:17) subtracts `contestStartMs`. The displayed rank is purely a relative
comparison and the contest-start offset is identical for all users, so it cancels and the
ordering is preserved — no rank bug today. The risk is latent: if anyone ever surfaces this
intermediate `total_penalty` as a number, or reuses the CTE for display, it will be wildly
wrong. Recommend subtracting the contest start for clarity/safety even though current output
is correct.

**B4 — Strength — Freeze cutoff is consistent.** The frozen ranking filters all submissions
(including the `first_ac_at` window) by `submitted_at <= cutoffSec`
(`contest-scoring.ts:214-223,237-240`), so wrong-before-AC counts and AC timestamps are all
computed within the frozen snapshot. Cache keys separate live vs frozen
(`${assignmentId}:${cutoffSec ?? 'live'}`), and auto-unfreeze is bounded by the contest end
(leaderboard.ts:68-74), fixing the prior "frozen forever" issue.

**B5 — Strength — Float drift handled.** IOI totals are rounded to 2 decimals after summation
(contest-scoring.ts:434) and tie detection uses an epsilon (`isScoreTied`, line 452-454)
matching the SQL `ROUND(...,2)`. Equal scores correctly share a rank.

### C. Authoring (problems, test cases, limits, comparison)

**C1 — Strength — Hidden test data is not leaked.** The submission detail query selects only
`{ sortOrder, isVisible }` from `testCase` (`submissions/[id]/route.ts:33`) — never `input`
or `expectedOutput` — and `sanitizeSubmissionForViewer` nulls `actualOutput` for hidden cases
and for non-`showDetailedResults` problems (`src/lib/submissions/visibility.ts:39-52`). Test
cases default to `isVisible: false` (schema.pg.ts:299), a safe default for exams.

**C2 — SUSPECTED — Low — Per-hidden-test pass/fail status + timing still exposed.** When
`showDetailedResults` is true, hidden cases keep their `status` (and, unless gated,
`executionTimeMs`/`memoryUsedKb`) even though `actualOutput` is nulled
(visibility.ts:46-48). Pass/fail per hidden test is conventional, but for a high-stakes exam
an organizer may want a "summary only" mode that hides which hidden test failed. Consider a
problem-level toggle.

**C3 — Strength — Float comparison.** `judge-worker-rs/src/comparator.rs:113-156` accepts a
token if either absolute or relative error is within tolerance, defaulting both to `1e-9`
when unset, and compares non-numeric tokens exactly. Token-count mismatch fails fast. This is
a defensible default for float problems.

### D. Operations (anti-cheat, rejudge, CSV, monitoring)

**D1 — Strength — Rejudge guards finished contests.** `submissions/[id]/rejudge/route.ts:86-115`
flags a rejudge of a submission whose contest deadline has passed with an audit-log warning
(`warning: contest_finished`) and invalidates the ranking cache. The admin bulk rejudge
(`admin/submissions/rejudge/route.ts:79`) invalidates the whole cache. Good operational
hygiene.

**D2 — Strength — CSV injection + RFC 4180.** `src/lib/csv/escape-field.ts` tab-prefixes
fields beginning with `= + - @ \t \r` and quotes/escapes per RFC 4180. Grade and contest
exports both route through it, and both cap at 10,000 rows to avoid OOM.

**D3 — Strength — Anti-cheat heartbeat correlation.** `validateAssignmentSubmission:298-317`
requires a recent browser-issued anti-cheat event before accepting a submission when
`enableAntiCheat && examMode != none`, closing the curl-only second-device path. Note the
dependency on A5: if anti-cheat is unintentionally off (wrong creation path), this protection
silently does nothing.

**D4 — SUSPECTED — Low — Anonymized board label leaks ordering.** The leaderboard route
labels anonymized rows `Participant ${rest.rank}` (leaderboard route:81) and contest export
uses `Candidate ${entry.rank}`. Because rank order is stable and visible, a participant who
knows roughly when peers solved problems can de-anonymize neighbors. Acceptable for most
cases; flag only for highly sensitive recruiting.

**D5 — Strength — Access-code generation.** `access-codes.ts:13-25` uses
`crypto.randomBytes` with rejection sampling over a 32-char unambiguous alphabet, retries on
unique-constraint collision, and redemption runs in a transaction with deadline checks
(`redeemAccessCode:111-198`). Solid.

---

## Priority-ranked fix checklist

1. **[Critical]** Add `freezeLeaderboardAt`, `showResultsToCandidate`, `hideScoresFromCandidates`
   to `assignmentPatchSchema` (validators/assignments.ts:122-136) so contest/assignment edits
   stop 400-ing. Add a route test that PATCHes a contest and asserts 200. (A1)
2. **[High]** Thread the same three fields into the PATCH handler's
   `assignmentMutationSchema.safeParse({...})` object using the existing assignment row as the
   fallback (route.ts:128-163), so an edit preserves the freeze time and visibility flags
   instead of nulling/zeroing them. Add an assertion that freeze survives an unrelated edit. (A2)
3. **[Medium]** Persist `anonymousLeaderboard`: add it to `assignmentMutationSchema` and both
   `createAssignmentWithProblems` / `updateAssignmentWithProblems`, or remove the column +
   read + UI toggle. (A3)
4. **[Medium]** Validate `freezeLeaderboardAt` is within `[startsAt, deadline)` in
   `assignmentMutationSchema.superRefine`. (A4)
5. **[Medium]** Unify the `enableAntiCheat` default across quick-create and the general form;
   prefer `true` for exam/recruiting modes. (A5)
6. **[Medium]** Surface a UI warning that score overrides do not affect ICPC ranking, and that
   the frozen-window live rank ignores overrides; or finish the deferred N7-C7 overlay. (B2)
7. **[Low]** Subtract contest start in the ICPC single-user live-rank penalty for safety even
   though ordering is currently correct (leaderboard.ts:168). (B3)
8. **[Low]** Optional "summary-only" mode that hides per-hidden-test pass/fail + timing for
   high-stakes exams (visibility.ts:46-52). (C2)
9. **[Low]** Consider de-anonymization risk from stable rank labels on anonymized boards if
   recruiting confidentiality is a hard requirement. (D4)

## Verification notes
- A1 was confirmed by executing a faithful replica of `assignmentPatchSchema` (project Zod
  4.3.6) against the exact payload the edit dialog sends; result was
  `success: false, unrecognized_keys`.
- A2/A3 confirmed by reading every create/update/route write path for the affected columns
  (grep across `src/lib` and `src/app`).
- All file:line citations are from the working tree at review time.
