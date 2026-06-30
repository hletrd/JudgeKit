# Instructor Review

**Date:** 2026-06-30
**Scope:** entire repository, instructor-facing flows (problem authoring, assignment/contest configuration, grading, plagiarism, reporting, communication)
**Summary:** JudgeKit implements a capable contest engine, but several core course-instructor workflows are gated behind `examMode === "none"` guards or missing entirely. The most painful gaps are broadcast announcements and similarity checks for regular homework, a group-gradebook CSV that cannot feed an LMS, no per-student deadline extensions for non-windowed assignments, and no special-judge support. Most issues are medium-to-high severity product gaps rather than security bugs.
**Findings count:** 20

---

## HIGH: Announcements are disabled for regular homework assignments
- **File**: `src/app/api/v1/contests/[assignmentId]/announcements/route.ts` (line 12-17)
- **Problem**: `canAccessContestAnnouncements` returns `hasAccess: false` for every assignment whose `examMode` is `"none"`. The create and list endpoints therefore 404 for normal homework assignments.
- **Failure scenario**: An instructor discovers a typo in a test case or needs to broadcast a clarification 45 minutes into a 3-hour take-home homework. There is no in-platform way to notify the 120 enrolled students; corrections must be sent through Slack/email and some students miss them, leading to unfair Wrong-Answer verdicts.
- **Suggested fix**: Remove the `assignment.examMode === "none"` guard from `canAccessContestAnnouncements`. Enrollment check plus `canManageContest` is sufficient. Rename the route namespace from `contests` to `assignments` if the URL is intended to be generic.
- **Cross-references**: `src/components/contest/contest-announcements.tsx`; `src/app/api/v1/contests/[assignmentId]/clarifications/route.ts` (same guard)

## HIGH: Similarity check returns 404 for all non-exam assignments
- **File**: `src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts` (line 32-34)
- **Problem**: The `POST` handler rejects the request with `notFound` when `assignment.examMode === "none"`. Plagiarism detection is therefore unavailable for the assignment type where copying is most common.
- **Failure scenario**: An instructor suspects collusion on a 2-week take-home assignment. The anti-cheat dashboard button calls this endpoint and receives a 404, so no similarity report can be generated.
- **Suggested fix**: Drop the `examMode === "none"` check. Gate only on `canRunSimilarityCheck`, which already verifies management rights, TA status, or assigned-teaching-group membership.
- **Cross-references**: `src/lib/assignments/code-similarity.ts`; `src/components/contest/anti-cheat-dashboard.tsx`

## HIGH: Group gradebook CSV export has no per-problem columns
- **File**: `src/app/api/v1/groups/[id]/assignments/[assignmentId]/export/route.ts` (line 61-75)
- **Problem**: The exported CSV header is hard-coded to `Student Name, Username, Class, Status, Score, Submitted At` and emits only the total best score. There are no per-problem columns, no override indicator, and no raw-vs-adjusted late-penalty split.
- **Failure scenario**: A 4-problem homework is exported for upload to Canvas/Blackboard/Moodle, all of which expect one column per scored item. The instructor must manually pivot or re-enter 120 × 4 = 480 per-problem scores.
- **Suggested fix**: Build the header dynamically from `statusData.problems`, emitting one `Score` and one `Attempts` column per problem (with max points in the header), plus `Raw Score`, `Late Penalty`, `Adjusted Score`, and `Overridden` flag columns when applicable. Mirror the richer layout already present in `src/app/api/v1/contests/[assignmentId]/export/route.ts`.
- **Cross-references**: `src/lib/assignments/submissions.ts`; `src/app/(public)/groups/[id]/assignments/[assignmentId]/status-board.tsx`

## HIGH: No per-student deadline extension for non-windowed assignments
- **File**: `src/app/api/v1/groups/[id]/assignments/[assignmentId]/exam-sessions/[userId]/route.ts` (line 52-55)
- **Problem**: The extension endpoint explicitly returns `examModeInvalid` unless the assignment is `windowed`. Regular homework (`examMode === "none"`) and scheduled exams have no per-student extension mechanism.
- **Failure scenario**: A student with a documented illness or disability accommodation needs a 48-hour extension on a homework. The instructor can only extend the global deadline for all 120 students or perform a post-deadline score override, losing the auto-judging window.
- **Suggested fix**: Add a `student_deadline_overrides` table keyed by `(assignment_id, user_id)` storing an optional extended deadline. Apply it in the late-penalty calculation alongside the personal deadline used for windowed exams. Surface an "Extend deadline" action in the status board for any assignment mode.
- **Cross-references**: `src/lib/assignments/exam-sessions.ts`; `src/lib/assignments/scoring.ts`

## HIGH: No special judge / custom checker support
- **File**: `src/app/(public)/problems/create/create-problem-form.tsx` (line 802-843)
- **Problem**: The comparison mode select offers only `exact` and `float`. There is no way to upload a custom checker binary or script to judge problems with multiple valid outputs.
- **Failure scenario**: An instructor assigns "output any valid topological order" or "find any shortest path". Students with correct but non-canonical answers receive WA, forcing manual regrading of dozens of submissions.
- **Suggested fix**: Add a `checker` problem type and a checker upload field in the problem form. Run the uploaded checker inside the sandbox with the test input, participant output, and judge output.
- **Cross-references**: `src/lib/validators/problem-management.ts`; `src/lib/judge/verdict.ts`

## HIGH: Assignment deadline input uses browser-local timezone while students see server timezone
- **File**: `src/app/(public)/groups/[id]/assignment-form-dialog.tsx` (line 73-82)
- **Problem**: `formatDateTimeInput` and `parseDateTimeInput` convert timestamps using `date.getTimezoneOffset()`, i.e. the instructor's browser timezone. The rest of the system enforces and displays deadlines in the configured system timezone (`getResolvedSystemTimeZone()`). An instructor in a different timezone will unknowingly set the wrong wall-clock deadline.
- **Failure scenario**: Server timezone is UTC; instructor is in KST. The instructor enters "23:59" expecting 11:59 PM Korea time. The form stores 14:59 UTC, and students see "2:59 PM" as the deadline. Evening submissions are counted on-time by the system but considered late by the instructor.
- **Suggested fix**: Label every datetime input with the active system timezone, and optionally accept input in that timezone instead of browser-local. Add a confirmation step when the browser timezone differs from the system timezone.
- **Cross-references**: `src/lib/system-settings.ts`; `src/lib/datetime.ts`

## HIGH: ICPC score overrides are silently ignored by the leaderboard
- **File**: `src/lib/assignments/contest-scoring.ts` (line 274-286, 354-356)
- **Problem**: The comment at lines 274-286 admits that score overrides are intentionally not applied for ICPC scoring because there is no AC timestamp. The leaderboard therefore diverges from the gradebook after an instructor override.
- **Failure scenario**: In an ICPC-style contest an instructor grants partial credit via override. The gradebook shows the new score, but the public/candidate leaderboard still shows the original 0, causing contradictory standings.
- **Suggested fix**: Decide an ICPC override semantics (e.g. treat override ≥ points as an AC at override time, or introduce a separate "solved" flag) and implement it consistently in `computeContestRanking`. Until then, surface a UI warning that ICPC overrides are gradebook-only.
- **Cross-references**: `src/app/api/v1/groups/[id]/assignments/[assignmentId]/overrides/route.ts`; `src/app/(public)/groups/[id]/assignments/[assignmentId]/status-board.tsx`

## MEDIUM: No boilerplate / template exclusion for similarity detection
- **File**: `src/lib/assignments/code-similarity.ts` (line 259-309)
- **Problem**: `runSimilarityCheckTS` compares normalized source directly. There is no mechanism to subtract instructor-provided starter code before computing Jaccard similarity.
- **Failure scenario**: A Data Structures assignment distributes a 100-line linked-list skeleton to 120 students. The similarity detector flags every pair that kept the boilerplate, producing thousands of false positives and hiding the few real cheating pairs.
- **Suggested fix**: Allow instructors to upload or paste boilerplate source per assignment. Subtract the boilerplate n-grams from each submission's n-gram set before pairwise comparison.
- **Cross-references**: `src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts`; `src/components/contest/anti-cheat-dashboard.tsx`

## MEDIUM: Similarity hits cannot be marked as reviewed or cleared
- **File**: `src/lib/assignments/code-similarity.ts` (line 404-454)
- **Problem**: `runAndStoreSimilarityCheck` deletes all prior `code_similarity` events and re-inserts new ones. The dashboard displays pairs but has no `reviewedAt` / `reviewOutcome` fields.
- **Failure scenario**: After triaging 50 flagged pairs an instructor cannot distinguish the 47 cleared cases from the 3 escalated ones. Re-running the check resets everything to "unreviewed".
- **Suggested fix**: Add `reviewed_at`, `reviewed_by`, and `outcome` columns to `anti_cheat_events` (or a separate review table). Expose a dropdown on each pair row and preserve review state across similarity re-runs.
- **Cross-references**: `src/lib/db/schema.pg.ts`; `src/components/contest/anti-cheat-dashboard.tsx`

## MEDIUM: No per-problem language restriction in exams
- **File**: `src/app/(public)/groups/[id]/assignment-form-dialog.tsx` (line 569-675)
- **Problem**: The assignment form supports anti-cheat, scoring model, and visibility, but there is no `allowedLanguages` field per problem or per assignment.
- **Failure scenario**: An instructor wants to assess C++ pointer skills and must prevent Python submissions. Currently students can submit in any enabled language.
- **Suggested fix**: Add `allowedLanguages` to `assignment_problems` (default: all enabled). Enforce it at submission creation by checking the selected language against the list.
- **Cross-references**: `src/lib/db/schema.pg.ts`; `src/app/api/v1/submissions/route.ts`

## MEDIUM: Manual problems have no structured grading workflow
- **File**: `src/app/(public)/problems/create/create-problem-form.tsx` (line 113-114, 779-785)
- **Problem**: `problemType === "manual"` is selectable, but there is no UI for instructors to enter rubric criteria, collect submissions, assign scores, or surface manual grades in the gradebook.
- **Failure scenario**: An instructor creates a manual essay-style problem. Submissions arrive but there is no place to enter scores, so the problem contributes 0 to every student's total with no indication that grading is pending.
- **Suggested fix**: Either remove `manual` from the public problem-type selector until the grading workflow exists, or implement a rubric/score entry panel on the assignment status board and submission detail page.
- **Cross-references**: `src/lib/validators/problem-management.ts`; `src/lib/assignments/submissions.ts`

## MEDIUM: Override audit metadata is not surfaced in the gradebook UI
- **File**: `src/app/(public)/groups/[id]/assignments/[assignmentId]/status-board.tsx` (line 246-279, 493-520)
- **Problem**: The status board shows an italic score and a pencil icon for overridden scores, but the tooltip only says "Score overridden". The `createdBy`, `createdAt`, and `reason` fields stored in `score_overrides` are not fetched or displayed.
- **Failure scenario**: A student disputes a grade. The instructor sees the score was overridden but cannot tell which TA changed it, when, or why without querying the admin audit log separately.
- **Suggested fix**: Extend `getAssignmentStatusRows` to join override metadata and render it in the tooltip or an expandable details row.
- **Cross-references**: `src/app/api/v1/groups/[id]/assignments/[assignmentId]/overrides/route.ts`; `src/lib/assignments/submissions.ts`

## MEDIUM: No "Rejudge this assignment" action on the gradeboard
- **File**: `src/app/(public)/groups/[id]/assignments/[assignmentId]/page.tsx` (line 307-416)
- **Problem**: After fixing a buggy test case an instructor must navigate to Admin → Submissions, filter, and trigger bulk rejudge. The assignment status board has no contextual rejudge button.
- **Failure scenario**: An instructor updates a test case at 11 PM. The fastest path to re-judge the whole class is through the admin panel; the gradeboard provides no obvious recovery action.
- **Suggested fix**: Add a "Rejudge all submissions" button on the assignment detail page, scoped to the current assignment and visible only to users with `submissions.rejudge`. Reuse the existing `/api/v1/admin/submissions/rejudge` bulk endpoint.
- **Cross-references**: `src/app/(dashboard)/dashboard/admin/submissions/admin-submissions-bulk-rejudge.tsx`; `src/app/api/v1/admin/submissions/rejudge/route.ts`

## MEDIUM: Late penalty is not broken out in the gradebook or export
- **File**: `src/lib/assignments/scoring.ts` (line 13-59); `src/app/(public)/groups/[id]/assignments/[assignmentId]/status-board.tsx` (line 417-418)
- **Problem**: The adjusted score is displayed, but neither the status board nor the CSV export shows the raw pre-penalty score or the penalty amount applied.
- **Failure scenario**: A student submits one hour late with a 25 % penalty and disputes the grade. The gradebook shows 75 but does not show that the raw score was 100 and 25 was deducted.
- **Suggested fix**: Include `rawScore`, `latePenaltyPercent`, and `adjustedScore` in the status row data model and render all three in the UI/export when a penalty was applied.
- **Cross-references**: `src/lib/assignments/submissions.ts`; `src/app/api/v1/groups/[id]/assignments/[assignmentId]/export/route.ts`

## MEDIUM: No problem statement version history
- **File**: `src/app/(public)/problems/[id]/edit/page.tsx` (line 17-127)
- **Problem**: The edit page persists only the latest `description`. There is no audit table or history view of prior statement versions.
- **Failure scenario**: An instructor edits a constraint mid-deadline. Students who read the earlier version solve a different problem, and there is no record of what changed, when, or by whom.
- **Suggested fix**: Add a `problem_revisions` table capturing `description`, `updatedAt`, and `updatedBy`. Surface a "History" tab on the edit page and show a change notice in the student view when the statement was modified after the assignment started.
- **Cross-references**: `src/lib/db/schema.pg.ts`; `src/app/(public)/problems/[id]/page.tsx`

## MEDIUM: No test-case generator / validator support
- **File**: `src/app/(public)/problems/create/create-problem-form.tsx` (line 928-1098)
- **Problem**: The form supports manual entry and ZIP import of static test cases. There is no way to attach a generator script or a validator script to produce or verify large hidden test suites.
- **Failure scenario**: An instructor needs 200 edge cases for a graph problem. They must generate them locally, package a ZIP, and upload it. If a bug is found, the entire suite must be regenerated and re-uploaded.
- **Suggested fix**: Add optional `generatorSource` and `validatorSource` fields per problem; allow running the generator inside the sandbox to regenerate cases and the validator to check expected outputs.
- **Cross-references**: `src/lib/validators/problem-management.ts`; `src/lib/problem-management.ts`

## MEDIUM: No import adapter for external archives (Polygon, BOJ, Codeforces)
- **File**: `src/app/api/v1/problems/import/route.ts` (line 8-48)
- **Problem**: The import endpoint accepts only the JudgeKit JSON schema. It cannot ingest a Polygon package, a Baekjoon Online Judge problem pack, or a remote problem statement.
- **Failure scenario**: An instructor wants to reuse a Codeforces problem for a practice contest. They must manually re-type the statement, recreate test cases, and set limits.
- **Suggested fix**: Add a `source` discriminator to the import schema (e.g. `judgekit-json`, `polygon-zip`, `boj-url`) and implement adapters that normalize external packages to the internal model.
- **Cross-references**: `src/lib/validators/problem-import.ts`; `src/lib/problem-management.ts`

## LOW: `defaultLanguage` is a free-text input with no validation
- **File**: `src/app/(public)/problems/create/create-problem-form.tsx` (line 917-926)
- **Problem**: The "Default Language" field is a plain text input. A typo such as `pyhon` is silently accepted and stored; the student editor then has no pre-selected language.
- **Failure scenario**: An instructor mistypes the default language. Every student sees an empty language selector and may submit in the wrong language.
- **Suggested fix**: Replace the text input with a searchable dropdown populated from the active `language_configs` list.
- **Cross-references**: `src/app/api/v1/languages/route.ts`; `src/lib/judge/languages.ts`

## LOW: Hard cap of 100 test cases per problem
- **File**: `src/lib/validators/problem-import.ts` (line 35)
- **Problem**: The problem import schema rejects problems with more than 100 test cases.
- **Failure scenario**: A competitive-programming problem with 200 small randomized cases is rejected at import even though the judge can handle them.
- **Suggested fix**: Raise or operator-configure the cap; the UI's ZIP import already bypasses the per-textarea bottleneck.
- **Cross-references**: `src/lib/validators/problem-management.ts`; `src/app/(public)/problems/create/create-problem-form.tsx`

## LOW: Similarity threshold is hardcoded
- **File**: `src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts` (line 50)
- **Problem**: `runAndStoreSimilarityCheck` is called with the default threshold (0.85) and n-gram size (3). Instructors cannot tune sensitivity.
- **Failure scenario**: An instructor wants stricter detection (0.75) for a small honors class or looser detection (0.90) to reduce noise in a large intro course. Neither is possible.
- **Suggested fix**: Accept optional `threshold` and `ngramSize` query/body parameters with bounds (e.g. threshold 0.5-0.99, ngram 2-5).
- **Cross-references**: `src/lib/assignments/code-similarity.ts`

---

## Section Scores

| Area | Score | Rationale |
|------|-------|-----------|
| 1. Problem Authoring | 5/10 | Markdown + KaTeX works, ZIP import works, but no version history, no external import, no per-language limits, free-text default language. |
| 2. Test Data & Judging | 4/10 | Exact/float comparison only, no special judge, no generator/validator, 100-case cap, WA diff not inline in gradebook. |
| 3. Assignment Configuration | 5/10 | Deadlines, late penalty, points, exam modes work, but no per-student extensions for homework, timezone mismatch, no attempt limits, no drop-lowest policy. |
| 4. Exam Setup & Live Operations | 6/10 | Windowed/scheduled exams and per-student extensions work, but announcements/clarifications are contest-only, no per-problem language restriction, no grace period. |
| 5. Grading at Scale | 5/10 | Status board and overrides work, but group CSV lacks per-problem columns, override audit hidden, no assignment-level rejudge button, late penalty not broken out, ICPC overrides ignored. |
| 6. Plagiarism & Academic Integrity | 3/10 | Jaccard engine works but is unavailable for homework, no boilerplate exclusion, no review state, no evidence export, threshold fixed. |
| 7. Reporting & LMS Export | 4/10 | Contest export has per-problem columns, but group gradebook export is LMS-unfriendly; group analytics lacks per-problem stats and per-student progress. |
| 8. Communication & Announcements | 2/10 | Contest announcements/clarifications work, but regular homework has none, no global/group banner, no edit-change notification. |

---

## Top 5 Blockers

| ID | Severity | Finding | File:Line |
|----|----------|---------|-----------|
| 1 | HIGH | Announcements disabled for regular homework | `src/app/api/v1/contests/[assignmentId]/announcements/route.ts:15` |
| 2 | HIGH | Similarity check disabled for regular homework | `src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts:33` |
| 3 | HIGH | Group CSV export has no per-problem columns | `src/app/api/v1/groups/[id]/assignments/[assignmentId]/export/route.ts:61` |
| 4 | HIGH | No per-student extension for non-windowed assignments | `src/app/api/v1/groups/[id]/assignments/[assignmentId]/exam-sessions/[userId]/route.ts:52` |
| 5 | HIGH | No special judge / custom checker | `src/app/(public)/problems/create/create-problem-form.tsx:802` |

## Top 5 Polish Items

| ID | Severity | Finding | File:Line |
|----|----------|---------|-----------|
| 1 | HIGH | Browser-vs-server timezone mismatch in deadline input | `src/app/(public)/groups/[id]/assignment-form-dialog.tsx:73` |
| 2 | HIGH | ICPC score overrides ignored by leaderboard | `src/lib/assignments/contest-scoring.ts:285` |
| 3 | MEDIUM | Similarity false positives from shared boilerplate | `src/lib/assignments/code-similarity.ts:259` |
| 4 | MEDIUM | Override audit metadata hidden in gradebook | `src/app/(public)/groups/[id]/assignments/[assignmentId]/status-board.tsx:246` |
| 5 | MEDIUM | No "Rejudge this assignment" action on gradeboard | `src/app/(public)/groups/[id]/assignments/[assignmentId]/page.tsx:307` |

---

## Final Sweep

- **Skipped / needs manual validation**: Browser runtime verification of the assignment form timezone behavior, actual CSV import into Canvas/Blackboard, similarity run against >500 submissions with Rust sidecar down, and ICPC override rendering in the candidate leaderboard.
- **Race conditions / concurrency**: Not a focus of this instructor-angle review; defer to security and test-engineer reviews.
- **Auth/authz**: Route guards appear consistent with `canManageGroupResourcesAsync` / `canManageContest`, but the TA/course-staff capability matrix alignment flagged in the aggregate (`C3-9`) should be resolved before claiming the instructor workflow is complete.
- **Commonly missed issues checked**: No SQL injection in instructor paths (parameterized queries observed), no secret leakage, no disabled tests flagged, no stale TODO/FIXME comments encountered in the files read.
