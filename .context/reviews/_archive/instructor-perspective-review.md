# Instructor Perspective Review: JudgeKit

**Review Date:** 2026-05-10
**Reviewer Role:** Instructor (creates assignments, grades submissions, manages classes)
**Scope:** All instructor-facing UI, workflows, APIs, and logic

---

## Executive Summary

JudgeKit is a capable programming assignment platform with solid foundations in auto-grading, contest management, and anti-cheat. However, from an instructor's daily-work perspective, there are significant friction points across problem authoring, manual grading, analytics, enrollment management, and communication workflows. Several features that would be considered table stakes in an educational platform are missing or incomplete.

**Severity Distribution:**
- CRITICAL: 4 findings
- HIGH: 12 findings
- MEDIUM: 18 findings
- LOW: 8 findings

---

## 1. Problem Creation Workflow

### 1.1 No Custom Validator / Checker Support
**File:** `src/app/(public)/problems/create/create-problem-form.tsx:1-992`
**Severity:** CRITICAL

The problem creation form only supports two comparison modes: `exact` and `float` (line 106). There is no way to upload a custom checker script (e.g., a Python or C++ program that validates output with problem-specific logic). This is a dealbreaker for many real-world problems:
- Problems with multiple valid outputs (e.g., "print any valid path")
- Problems requiring special judge logic (e.g., interactive problems, partial scoring)
- Problems where output formatting has relaxed constraints

**Impact:** Instructors must work around this by accepting only one specific output format, which often does not match the pedagogical intent. Many classic competitive programming problems cannot be authored at all.

**Suggested Fix:** Add a third comparison mode "custom" with a file upload for checker source code. The checker should receive input file, output file, and answer file as arguments and return exit code 0/42/1 for AC/WA/PE.

---

### 1.2 No Separate Sample I/O from Hidden Test Cases
**File:** `src/app/(public)/problems/create/create-problem-form.tsx:798-968`
**Severity:** HIGH

All test cases live in a single flat list with only an `isVisible` checkbox (line 956-963) to distinguish sample from hidden. There is no semantic distinction:
- No way to mark sample I/O as "for statement only" vs "also used in grading"
- No way to ensure sample cases are always shown first in the problem statement
- The `isVisible` flag controls both statement display AND whether it counts toward grading

**Impact:** Instructors accidentally expose hidden test cases or hide sample cases. Students see test cases in arbitrary order.

**Suggested Fix:** Add a `kind` field: `sample` (displayed, not graded), `example` (displayed and graded), `hidden` (not displayed, graded). Render samples in a dedicated "Sample Input / Output" section.

---

### 1.3 No Problem Preview Before Publishing
**File:** `src/app/(public)/problems/create/create-problem-form.tsx:510-583`
**Severity:** HIGH

The form has a description preview tab (line 510-583), but there is no way to see the full problem as a student would see it: rendered statement, sample I/O section, submission form with language selector, and expected behavior. Instructors must publish blind.

**Impact:** Formatting errors, missing test cases, and wrong limits only get caught after students start submitting. Reputation damage and student confusion.

**Suggested Fix:** Add a "Preview as Student" button that renders the full problem page in a modal or new tab with all test cases, limits, and submission UI.

---

### 1.4 No Test Case Generator or Validation Tools
**File:** `src/app/(public)/problems/create/create-problem-form.tsx`
**Severity:** HIGH

The only way to create test cases is manual entry or ZIP import (line 831-846). There are no tools to:
- Validate that output matches expected format
- Generate random test cases from a generator script
- Run a reference solution against test cases to verify expected output
- Check for duplicate test cases

**Impact:** Test case authoring is tedious and error-prone. Wrong expected outputs are common and only discovered when student submissions are judged.

**Suggested Fix:** Add a "Validate Test Cases" button that runs a reference solution against all inputs and compares outputs. Add a "Generate from Script" option for bulk test generation.

---

### 1.5 Test Case Content Collapses at 5000 Characters
**File:** `src/app/(public)/problems/create/create-problem-form.tsx:894-909`
**Severity:** MEDIUM

Large test cases (>5000 chars) are hidden behind a "Show Content" button (line 894-909). While this prevents UI lag, it makes reviewing and editing large test cases painful. There is no way to edit the collapsed content directly.

**Impact:** Instructors working with graph/tree problems (large inputs) must click "Show Content" for every test case, every time they edit.

**Suggested Fix:** Allow test case textarea to expand on focus or provide a "Expand All" toggle. Consider a Monaco editor for test cases instead of Textarea.

---

### 1.6 ZIP Import Has Rigid Filename Convention
**File:** `src/app/(public)/problems/create/create-problem-form.tsx:176-191`
**Severity:** MEDIUM

The ZIP importer only recognizes files matching `/^(\d+)\.(in|out|input|output|ans)$/i` (line 179). This breaks on:
- Files with suffixes like `1a.in`, `test1.in`
- Directories inside the ZIP
- Binary test data

**Impact:** Instructors must rename all their files to match the rigid pattern before importing.

**Suggested Fix:** Support more flexible patterns, allow directory traversal, and provide clear error messages listing which files were skipped and why.

---

### 1.7 No Test Case Versioning or Draft Mode
**File:** `src/lib/db/schema.pg.ts:288-303`
**Severity:** MEDIUM

The `test_cases` table has no versioning. Once a problem is edited and saved, previous test cases are gone. There is no way to:
- Save a draft problem without publishing
- Revert to previous test case sets
- Clone test cases from another problem

**Impact:** Mistakes in editing are permanent. No safe experimentation space.

**Suggested Fix:** Add a `problem_drafts` table or `version` column on test_cases. Allow problems to exist in draft state until explicitly published.

---

### 1.8 Problem Description Only Supports Markdown (No Rich Math)
**File:** `src/app/(public)/problems/create/create-problem-form.tsx:510-583`
**Severity:** MEDIUM

The description editor is a plain textarea with markdown preview. There is no LaTeX/KaTeX support for mathematical notation, no table editor, and no diagram support beyond images.

**Impact:** Instructors must write math in plaintext or embed images, which looks unprofessional and is hard to maintain.

**Suggested Fix:** Integrate KaTeX for math rendering and add a WYSIWYG markdown editor (e.g., MDXEditor) with math support.

---

## 2. Assignment Configuration

### 2.1 No Per-Student Extensions or Accommodations
**File:** `src/app/(public)/groups/[id]/assignment-form-dialog.tsx:94-132`
**Severity:** CRITICAL

The assignment form only supports global deadlines: `startsAt`, `deadline`, `lateDeadline`, and `latePenalty` (lines 119-124). There is no mechanism for:
- Per-student deadline extensions (disability accommodations)
- Excused absences
- Make-up windows for individual students

**Impact:** Instructors cannot accommodate students with disabilities, illness, or emergencies without creating entirely new assignments or manually tracking exceptions. This is a legal/compliance issue in many educational contexts.

**Suggested Fix:** Add an `assignment_extensions` table with `userId`, `extendedDeadline`, `reason` fields. The submission validation and scoring logic must respect these extensions.

---

### 2.2 Late Penalty Is a Flat Percentage (No Sliding Scale)
**File:** `src/lib/assignments/scoring.ts:38-58`
**Severity:** HIGH

The late penalty is a single flat percentage applied to the entire score (line 46-53). There is no support for:
- Sliding scale (e.g., -10% per hour late)
- Grace period (e.g., 1 hour with no penalty)
- Different penalties for different late periods

**Impact:** Instructors must choose between overly harsh (flat 50% off) or overly lenient (no penalty) policies. No nuanced policy is possible.

**Suggested Fix:** Support a penalty schedule: `(hoursLate, penalty%)` pairs. Default to current flat behavior for backward compatibility.

---

### 2.3 Assignment Description Is Plain Text Only
**File:** `src/app/(public)/groups/[id]/assignment-form-dialog.tsx:346-357`
**Severity:** HIGH

The assignment description uses a plain `<Textarea>` (line 350-355) with no markdown rendering, no preview, and no rich formatting. This is inconsistent with the problem description which at least has markdown support.

**Impact:** Instructors cannot format instructions, embed links, or create structured content. Assignment descriptions look unprofessional.

**Suggested Fix:** Use the same markdown editor component as the problem creation form, with preview tab and image upload support.

---

### 2.4 No Assignment Template or Duplication with Problems
**File:** `src/app/(public)/groups/[id]/page.tsx:380-385`
**Severity:** MEDIUM

While assignments can be duplicated (line 380-385), the duplication copies the assignment metadata but the problem links must be re-selected. There is no "template" concept for assignments with pre-configured problem sets.

**Impact:** Instructors teaching multiple sections of the same course must recreate assignments from scratch or duplicate and re-link problems.

**Suggested Fix:** Allow saving assignment configurations as templates. When duplicating, preserve problem links if they are still accessible.

---

### 2.5 Problem Reordering in Assignments Is Invisible
**File:** `src/lib/assignments/management.ts:171-182`
**Severity:** MEDIUM

The `sortOrder` is set by array index during creation (line 177-181), but there is no drag-and-drop UI to reorder problems after creation. Problems appear in the order they were added.

**Impact:** Instructors must delete and re-add problems to change order, losing any associated data.

**Suggested Fix:** Add drag-and-drop reordering in the assignment edit dialog.

---

### 2.6 No Assignment Scheduling (Auto-Open/Close)
**File:** `src/app/(public)/groups/[id]/assignment-form-dialog.tsx:359-383`
**Severity:** MEDIUM

While assignments have `startsAt` and `deadline`, there is no automatic state transition. The system checks dates at submission time but does not:
- Auto-publish when startsAt arrives
- Auto-close when deadline passes
- Send notifications before open/close

**Impact:** Instructors must manually monitor and publish/close assignments. Students miss deadlines because they weren't notified.

**Suggested Fix:** Add a scheduled job that transitions assignment states and sends email/push notifications.

---

### 2.7 No Partial Credit Configuration Per Problem
**File:** `src/lib/db/schema.pg.ts:394-414`
**Severity:** MEDIUM

The `assignmentProblems` table only has `points` (line 406). There is no support for:
- Partial credit rubrics (e.g., 50% for passing subset of test cases)
- Different weighting schemes per problem
- Extra credit problems

**Impact:** All problems are all-or-nothing (for ICPC) or linear percentage-based (for IOI). No granular control.

**Suggested Fix:** Add `partialCreditMode` and `rubric` fields to assignmentProblems.

---

## 3. Grading Transparency

### 3.1 Status Board Shows No Test Case Breakdown
**File:** `src/app/(public)/groups/[id]/assignments/[assignmentId]/status-board.tsx:448-512`
**Severity:** CRITICAL

The status board shows per-problem scores (line 455-458) and attempt counts, but instructors cannot see:
- Which specific test cases a student passed/failed
- Compilation errors for failed submissions
- Runtime error details
- Score progression over attempts

**Impact:** Instructors cannot diagnose why a student is struggling. "Wrong Answer" could mean anything from algorithmic error to off-by-one formatting.

**Suggested Fix:** Add expandable rows in the status board showing test case-level results. Link to the full submission detail page with diff view.

---

### 3.2 No Manual Grading UI for "Manual" Problem Type
**File:** `src/app/(public)/problems/create/create-problem-form.tsx:674-688`
**Severity:** CRITICAL

The form supports a `problemType: "manual"` (line 98, 676), but there is no corresponding grading interface in the status board or anywhere else. The `manual` type appears to exist only as a flag with no actual workflow.

**Impact:** Instructors who create manual-grading problems have no way to assign scores. The feature is effectively broken.

**Suggested Fix:** Build a full manual grading interface: see student submissions, leave inline comments, assign scores with rubrics, and publish feedback.

---

### 3.3 Score Override Dialog Has No Context
**File:** `src/app/(public)/groups/[id]/assignments/[assignmentId]/score-override-dialog.tsx:132-193`
**Severity:** HIGH

The score override dialog (line 132-193) shows only the current score and a number input. It does not show:
- The student's submission history for that problem
- The test case results
- The code that was submitted
- Comparison with other students' scores

**Impact:** Instructors override scores blindly, without understanding why the auto-grader produced its result. This leads to inconsistent grading.

**Suggested Fix:** Embed the submission detail view inside the override dialog, or at minimum link to it. Show the test case breakdown and diff view.

---

### 3.4 No Bulk Regrade from Assignment View
**File:** `src/app/(public)/groups/[id]/assignments/[assignmentId]/page.tsx:1-410`
**Severity:** HIGH

There is no way to trigger a regrade of all submissions for an assignment from the assignment detail page. The only bulk regrade exists in the admin submissions page (`src/app/(dashboard)/dashboard/admin/submissions/admin-submissions-bulk-rejudge.tsx`) which is global and not scoped to an assignment.

**Impact:** If a test case is fixed after students have submitted, instructors must either regrade one by one or use the global admin tool which may affect unrelated submissions.

**Suggested Fix:** Add a "Regrade All Submissions" button to the assignment detail page, scoped to that assignment only.

---

### 3.5 No Submission Comments or Feedback
**File:** `src/components/submissions/_components/comment-section.tsx`
**Severity:** HIGH

While a comment-section component exists (not fully reviewed), there is no evidence of instructor feedback being prominently displayed or required as part of the grading workflow. The status board has no comment indicators.

**Impact:** Instructors cannot provide line-by-line code review or general feedback through the platform. Students don't know why their submission failed or how to improve.

**Suggested Fix:** Integrate the comment section into the status board cells. Add a "feedback required" flag for manual grading.

---

### 3.6 No Rubric System
**File:** (entire codebase)
**Severity:** HIGH

There is no concept of a grading rubric anywhere in the codebase. Manual scoring is a free-form number with an optional text reason (line 166-173 in score-override-dialog.tsx).

**Impact:** Inconsistent grading across TAs. Students don't understand scoring criteria. No way to enforce standardized evaluation.

**Suggested Fix:** Add rubric creation to assignment setup: criteria with descriptions and point values. Score overrides should use rubric-based scoring.

---

### 3.7 Diff View Is Hidden Behind Submission Detail
**File:** `src/components/submissions/output-diff-view.tsx`
**Severity:** MEDIUM

The diff view exists but requires navigating to the submission detail page. Instructors reviewing many submissions must click back and forth constantly.

**Impact:** Slow grading workflow. Diff view should be accessible inline from the status board.

**Suggested Fix:** Add an inline diff/expansion in the status board table rows.

---

## 4. Analytics and Insights

### 4.1 No Cross-Assignment Analytics
**File:** `src/components/contest/analytics-charts.tsx:532-756`
**Severity:** HIGH

Analytics are per-assignment only. There is no way to see:
- Student progress across multiple assignments in a group
- Class-level trends over time
- Comparison between different semesters/sections
- Predictive analytics (which students are at risk)

**Impact:** Instructors cannot identify struggling students early or evaluate teaching effectiveness across assignments.

**Suggested Fix:** Add a group-level analytics dashboard showing per-student progress across all assignments, with trend lines and at-risk indicators.

---

### 4.2 Analytics Charts Are Static SVG (No Interactivity)
**File:** `src/components/contest/analytics-charts.tsx:59-180`
**Severity:** MEDIUM

All charts are hand-rolled SVG components (line 59-180) with no interactivity: no tooltips on hover, no zoom, no filtering, no click-to-drill-down.

**Impact:** Hard to get precise values. Cannot explore data dynamically.

**Suggested Fix:** Replace with a proper charting library (Recharts, Victory, or Chart.js) with interactive features.

---

### 4.3 No Per-Student Submission Timeline in Group View
**File:** `src/app/(public)/groups/[id]/assignments/[assignmentId]/page.tsx`
**Severity:** MEDIUM

The contest management page has a participant timeline (`src/components/contest/participant-timeline-view.tsx`), but the regular group assignment page does not. Instructors viewing a homework assignment cannot see when students started, how many attempts they made, or their time-to-solve.

**Impact:** Instructors cannot identify students who may have cheated (e.g., sudden spike in score after many failed attempts) or provide timely help.

**Suggested Fix:** Port the timeline view to the group assignment detail page.

---

### 4.4 Limited Score Distribution Buckets
**File:** `src/components/contest/analytics-charts.tsx:594-604`
**Severity:** LOW

The score distribution histogram uses fixed buckets from the API. Instructors cannot customize bucket sizes or view cumulative distributions.

**Impact:** Hard to analyze grade boundaries or set fair curves.

**Suggested Fix:** Add configurable bucket sizes and percentile views.

---

### 4.5 No Export of Analytics Data
**File:** `src/components/contest/analytics-charts.tsx`
**Severity:** MEDIUM

While contest results can be exported (line 58 in analytics page), the analytics charts themselves have no export. Instructors cannot download raw data for external analysis in Excel/R/Python.

**Impact:** Instructors who need deeper statistical analysis are blocked.

**Suggested Fix:** Add "Download Raw Data" buttons to each analytics card exporting CSV/JSON.

---

## 5. Enrollment Management

### 5.1 No CSV/Spreadsheet Import for Students
**File:** `src/app/(public)/groups/[id]/group-members-manager.tsx:1-529`
**Severity:** HIGH

The bulk enrollment supports two methods (line 406-482):
1. Checkbox selection from existing users (one by one)
2. Paste list of usernames (line 406-429)

Neither supports importing from a CSV with columns like `name, email, username, class, section`. There is no way to auto-create accounts for students who haven't signed up yet.

**Impact:** Large classes (100+ students) require tedious manual entry or pre-creating accounts outside the system.

**Suggested Fix:** Add CSV upload with columns: name, email, username, className. Auto-create inactive accounts and send invite emails.

---

### 5.2 No Self-Enrollment via Link or Access Code
**File:** `src/app/(public)/groups/[id]/group-members-manager.tsx`
**Severity:** HIGH

Groups require instructors to manually add each student. There is no:
- Self-enrollment link with optional access code
- Email invitation flow
- LMS enrollment sync (Canvas, Moodle, Blackboard)

**Impact:** Instructors must know every student's username in advance. Students cannot join on their own.

**Suggested Fix:** Add group enrollment links with optional access codes. Support LTI 1.3 for LMS integration.

---

### 5.3 No Section/Subgroup Support
**File:** `src/lib/db/schema.pg.ts:178-201`
**Severity:** MEDIUM

The `groups` table is flat. There is no concept of sections, recitation groups, or TAs assigned to subsets of students.

**Impact:** Large courses with multiple TAs cannot partition students for grading responsibilities.

**Suggested Fix:** Add `group_sections` table or tags on enrollments. Filter status board by section.

---

### 5.4 No Enrollment Audit Trail
**File:** `src/lib/db/schema.pg.ts:203-224`
**Severity:** MEDIUM

The `enrollments` table only tracks `enrolledAt` (line 215). There is no record of:
- Who added the student
- When they were removed
- Enrollment history (dropped/re-added)

**Impact:** Cannot investigate when a student lost access or resolve disputes about enrollment status.

**Suggested Fix:** Add `enrollment_logs` table or use the existing `audit_events` table for enrollment actions.

---

### 5.5 No Way to Transfer Students Between Groups
**File:** `src/app/(public)/groups/[id]/group-members-manager.tsx`
**Severity:** MEDIUM

Removing a student (line 297-327) just deletes the enrollment. There is no "transfer to another group" action that preserves submission history.

**Impact:** Students who switch sections lose all their submission history.

**Suggested Fix:** Add a transfer action that updates the `groupId` on enrollments and related records.

---

### 5.6 Paste Enrollment Limited to 500 Users
**File:** `src/app/(public)/groups/[id]/group-members-manager.tsx:234-236`
**Severity:** LOW

The paste enrollment rejects lists over 500 usernames (line 234-236). While reasonable, there is no explanation for this limit and no alternative for larger classes.

**Impact:** Confusion for instructors with very large classes.

**Suggested Fix:** Support chunked processing for larger lists, or direct CSV import.

---

## 6. Anti-Cheat Review

### 6.1 No False Positive Marking or Whitelist
**File:** `src/components/contest/anti-cheat-dashboard.tsx:107-602`
**Severity:** HIGH

The anti-cheat dashboard lists events (line 509-575) but instructors cannot:
- Mark an event as reviewed/false positive
- Whitelist certain behaviors (e.g., known IP changes for mobile users)
- Add notes to events

**Impact:** The same events reappear on every refresh. Instructors cannot dismiss benign events or document their investigation.

**Suggested Fix:** Add review state to events: `unreviewed`, `dismissed`, `confirmed`. Allow adding notes and filtering by review state.

---

### 6.2 No Configurable Sensitivity Thresholds
**File:** `src/lib/anti-cheat/review-model.ts:1-17`
**Severity:** HIGH

Event tiers are hardcoded (line 3-12): `tab_switch` is always "signal", `ip_change` is always "escalate". Instructors cannot configure:
- Which events to monitor
- Thresholds (e.g., how many tab switches before flagging)
- Whether to enable/disable specific checks per assignment

**Impact:** Different courses have different tolerance levels. A take-home exam should be less strict than a proctored final.

**Suggested Fix:** Add anti-cheat configuration per assignment: enable/disable event types, set thresholds, configure sensitivity.

---

### 6.3 Similarity Check Has No Side-by-Side Diff
**File:** `src/components/contest/anti-cheat-dashboard.tsx:243-294`
**Severity:** HIGH

The similarity check shows flagged pairs in a table (line 354-368) with percentage and language, but there is no way to:
- View the two submissions side by side
- See which parts of the code are similar
- Exclude boilerplate/common algorithms from comparison

**Impact:** Instructors must manually open each submission in separate tabs to compare. False positives from standard algorithms (e.g., Dijkstra template) waste time.

**Suggested Fix:** Add a side-by-side diff view for similarity pairs, with syntax highlighting on matched sections.

---

### 6.4 Anti-Cheat Events Lack Session Context
**File:** `src/components/contest/anti-cheat-dashboard.tsx:509-575`
**Severity:** MEDIUM

Events are shown as individual rows without session context. An instructor cannot see:
- The sequence of events for a student during a single session
- Whether events correlate with submission times
- Session duration and patterns

**Impact:** Hard to distinguish "student switched tabs to read documentation" from "student switched tabs to communicate with a collaborator."

**Suggested Fix:** Group events by session and show timeline view per student per session.

---

### 6.5 No Evidence Export for Academic Integrity Cases
**File:** `src/components/contest/anti-cheat-dashboard.tsx`
**Severity:** HIGH

There is no way to export anti-cheat data for formal academic integrity proceedings. No PDF report, no evidence bundle, no timestamp verification.

**Impact:** Instructors cannot present evidence to academic integrity boards. The platform data is not usable for formal disputes.

**Suggested Fix:** Add "Export Evidence Report" that generates a PDF with all events, similarity results, submission timeline, and IP logs for a specific student.

---

### 6.6 Code Similarity Service Can Timeout or Fail Silently
**File:** `src/components/contest/anti-cheat-dashboard.tsx:255-287`
**Severity:** MEDIUM

The similarity check handles `timed_out`, `service_unavailable`, and `too_many_submissions` (line 264-287), but these are shown as soft warnings that instructors might miss.

**Impact:** Instructors may assume no cheating was detected when actually the service failed.

**Suggested Fix:** Make service failures more prominent. Add retry logic and email notifications for failed checks.

---

## 7. Contest Management

### 7.1 No Team Support
**File:** `src/lib/db/schema.pg.ts:325-369`
**Severity:** CRITICAL

The entire data model assumes individual contestants. There are no teams, no team registrations, no team submission attribution, and no team standings.

**Impact:** Instructors cannot run team-based contests (e.g., ICPC-style team competitions, pair programming assignments).

**Suggested Fix:** Add `teams` and `team_members` tables. Allow assignments to be configured as individual or team mode.

---

### 7.2 No Custom Tie-Breaker Rules
**File:** `src/lib/assignments/contest-scoring.ts:367-385`
**Severity:** MEDIUM

Tie-breaking is hardcoded (line 367-385): for ICPC it's solved count -> penalty -> last AC time -> userId. For IOI it's score -> userId. No custom rules.

**Impact:** Instructors cannot implement custom tie-breakers (e.g., earlier registration time, fewer total attempts, specific problem priority).

**Suggested Fix:** Allow configurable tie-breaker criteria in assignment settings.

---

### 7.3 Frozen Leaderboard Cannot Be Unfrozen Early
**File:** `src/lib/db/schema.pg.ts:345`
**Severity:** MEDIUM

The `freezeLeaderboardAt` field (line 345) freezes the leaderboard at a specific time, but there is no "unfreeze" action. Contests with early conclusion cannot reveal final standings.

**Impact:** Instructors must wait for the freeze time to pass even if the contest ends early.

**Suggested Fix:** Add a manual "Unfreeze Leaderboard" button for instructors.

---

### 7.4 No Spectator Mode
**File:** `src/app/(public)/contests/manage/[assignmentId]/page.tsx`
**Severity:** MEDIUM

There is no way to give observers (e.g., department head, external judges) read-only access to contest standings without making them instructors.

**Impact:** External stakeholders cannot monitor contests without full editing permissions.

**Suggested Fix:** Add a "spectator" role with view-only access to leaderboard and submissions.

---

### 7.5 No Contest Pause/Resume
**File:** `src/lib/db/schema.pg.ts:325-369`
**Severity:** MEDIUM

Once a contest starts, there is no way to pause it (e.g., for technical issues, discovered cheating, or emergency). The `startsAt`/`deadline` are fixed.

**Impact:** Technical problems during a contest cannot be mitigated without editing deadlines and recalculating everything.

**Suggested Fix:** Add a `pausedAt`/`resumedAt` mechanism that extends deadlines for all active participants.

---

### 7.6 Contest Access Code Is Single Global Code
**File:** `src/components/contest/access-code-manager.tsx` (not fully reviewed)
**Severity:** LOW

The `accessCode` field (line 344 in schema) suggests a single access code per contest. There is no support for:
- Per-student unique codes
- One-time-use codes
- Code expiration

**Impact:** Shared codes can leak. No way to control who uses the code.

**Suggested Fix:** Support individual access tokens or one-time codes.

---

## 8. File Management

### 8.1 No Binary Test Data Support
**File:** `src/lib/db/schema.pg.ts:288-303`
**Severity:** HIGH

Test case `input` and `expectedOutput` are stored as `text()` columns (line 297-298). Binary data (images, serialized objects, byte streams) cannot be stored.

**Impact:** Problems requiring binary input/output cannot be created.

**Suggested Fix:** Support file-based test case storage for binary data, with the text columns serving as metadata or fallback.

---

### 8.2 No Test Data Size Validation Before Upload
**File:** `src/app/(public)/problems/create/create-problem-form.tsx:374-394`
**Severity:** MEDIUM

File uploads for test cases (line 374-394) have no size validation. Large files could cause memory issues or storage exhaustion.

**Impact:** Risk of performance degradation or DoS from oversized test files.

**Suggested Fix:** Add client-side and server-side size limits with clear error messages.

---

### 8.3 No Test Data Versioning or Backup
**File:** `src/lib/db/schema.pg.ts:288-303`
**Severity:** MEDIUM

No versioning on test cases. No way to export test data for backup or sharing.

**Impact:** Lost test cases if accidentally overwritten. Cannot share test data with collaborators.

**Suggested Fix:** Add test case versioning and export to ZIP.

---

### 8.4 Image Upload Is Only for Problem Descriptions
**File:** `src/app/(public)/problems/create/create-problem-form.tsx:318-354`
**Severity:** LOW

Images can be uploaded to problem descriptions (line 318-354) but not to assignment descriptions, announcements, or feedback comments.

**Impact:** Inconsistent media support across the platform.

**Suggested Fix:** Extend image upload to all rich text areas.

---

## 9. Communication with Students

### 9.1 Announcements Are Contest-Only
**File:** `src/components/contest/contest-announcements.tsx:1-254`
**Severity:** HIGH

Announcements exist only for contests (`examMode !== "none"`). Regular group assignments have no announcement system.

**Impact:** Instructors cannot broadcast updates, corrections, or reminders for homework assignments.

**Suggested Fix:** Extend announcements to all assignment types, or add group-level announcements.

---

### 9.2 No Email or Push Notifications
**File:** (entire codebase)
**Severity:** HIGH

There is no notification system whatsoever. No emails for:
- Assignment open/close reminders
- Grade publication
- Anti-cheat alerts
- Announcement posts

**Impact:** Students miss deadlines. Instructors must use external channels (email, Slack, LMS) to communicate.

**Suggested Fix:** Integrate with an email service (Resend, SendGrid) and add notification preferences for both instructors and students.

---

### 9.3 Clarifications Are Contest-Only
**File:** `src/components/contest/contest-clarifications.tsx` (referenced in contest page)
**Severity:** HIGH

The clarification system (student asks question, instructor answers) is only available in contest mode. Regular assignments have no Q&A.

**Impact:** Students with questions about homework must use external channels. Instructors answer the same questions repeatedly.

**Suggested Fix:** Extend clarifications to all assignment types.

---

### 9.4 No Direct Messaging Between Instructor and Student
**File:** (entire codebase)
**Severity:** MEDIUM

There is no 1:1 messaging system. Instructors cannot reach out to struggling students privately.

**Impact:** Privacy concerns when discussing academic performance. No way to provide personalized guidance.

**Suggested Fix:** Add a simple messaging system scoped to group membership.

---

### 9.5 No Bulk Announcement Across Groups
**File:** `src/components/contest/contest-announcements.tsx`
**Severity:** MEDIUM

Announcements are per-contest. Instructors teaching multiple sections must post the same announcement separately.

**Impact:** Tedious and error-prone. Risk of inconsistent messaging.

**Suggested Fix:** Add "cross-post to multiple groups" option when creating announcements.

---

## 10. Export/Import Capabilities

### 10.1 No Full Group Backup/Restore
**File:** `src/app/(dashboard)/dashboard/admin/settings/database-backup-restore.tsx`
**Severity:** HIGH

The admin backup/restore is a raw database operation. Instructors cannot export a single group with all assignments, problems, test cases, and submissions as a portable archive.

**Impact:** Cannot migrate a course between instances. Cannot share course materials with colleagues.

**Suggested Fix:** Add group-level export/import that packages everything into a standardized format (e.g., YAML + ZIP).

---

### 10.2 No LMS Integration (LTI, Canvas, Moodle)
**File:** (entire codebase)
**Severity:** HIGH

No LTI, Canvas API, Moodle, or Blackboard integration. Grades must be manually transcribed.

**Impact:** Every instructor must manually enter scores into their gradebook. Major adoption barrier for educational institutions.

**Suggested Fix:** Implement LTI 1.3 Advantage for grade passback. Add Canvas/Moodle API integrations.

---

### 10.3 Problem Export Does Not Include Test Cases
**File:** `src/app/(public)/problems/[id]/problem-export-button.tsx` (not fully reviewed)
**Severity:** MEDIUM

The problem export button exists but its functionality is unclear from the codebase. If it only exports metadata (title, description), test cases are left behind.

**Impact:** Problems cannot be truly ported or shared without test data.

**Suggested Fix:** Ensure problem export includes all test cases, tags, and configuration in a single archive.

---

### 10.4 No Standardized Format for Problem Import
**File:** `src/components/problem/problem-import-button.tsx` (referenced)
**Severity:** MEDIUM

The problem import button exists but the supported formats are unclear. No support for standard formats like:
- Polygon (Codeforces)
- Kattis
- DOMjudge
- PC^2

**Impact:** Instructors cannot import problems from existing problem banks.

**Suggested Fix:** Support Polygon and Kattis package formats.

---

### 10.5 Export Does Not Include Analytics
**File:** `src/components/contest/export-button.tsx:1-70`
**Severity:** LOW

The export button (line 20-56) exports results but not analytics data. Instructors cannot export score distributions or solve rates for external analysis.

**Impact:** Limited for instructors doing research or detailed grade analysis.

**Suggested Fix:** Add analytics data as a separate export option or sheet in the CSV.

---

## Additional Findings

### A.1 Instructor Dashboard Is Minimal
**File:** `src/app/(public)/dashboard/_components/instructor-dashboard.tsx`
**Severity:** MEDIUM

The instructor dashboard (not fully reviewed) appears to lack actionable insights: no pending tasks, no alerts for assignments closing soon, no student-at-risk notifications.

**Impact:** Instructors must manually check each group and assignment.

**Suggested Fix:** Add a task-oriented dashboard: assignments needing attention, unread clarifications, anti-cheat alerts, students with no submissions.

---

### A.2 No Way to View All Submissions for a Student Across All Assignments
**File:** `src/app/(public)/groups/[id]/assignments/[assignmentId]/student/[userId]/page.tsx`
**Severity:** MEDIUM

The student submissions page (line 36-265) is scoped to a single assignment. There is no cross-assignment student view.

**Impact:** Office hours require navigating multiple pages to understand a student's overall performance.

**Suggested Fix:** Add a student profile page showing all submissions across all groups/assignments.

---

### A.3 Role-Based Access Control Is Complex and Opaque
**File:** `src/lib/capabilities/` (directory)
**Severity:** MEDIUM

Capabilities are cached and resolved dynamically. Instructors may not understand what they can or cannot do without trial and error.

**Impact:** Confusion about permissions. TAs may have unexpected limitations.

**Suggested Fix:** Add a "My Permissions" page showing effective capabilities and explanations.

---

### A.4 Mobile Experience for Status Board Is Cards-Only
**File:** `src/app/(public)/groups/[id]/assignments/[assignmentId]/status-board.tsx:530-568`
**Severity:** LOW

The mobile view uses collapsible cards (line 530-568) instead of the table. While functional, it is hard to scan and compare students.

**Impact:** Instructors on tablets/phones have a degraded experience.

**Suggested Fix:** Optimize the table for horizontal scroll on mobile rather than card view.

---

### A.5 No Keyboard Shortcuts for Grading Workflow
**File:** `src/app/(public)/groups/[id]/assignments/[assignmentId]/status-board.tsx`
**Severity:** LOW

The status board has no keyboard shortcuts for common actions: navigate between students, open submission, apply override.

**Impact:** Slow grading workflow for large classes.

**Suggested Fix:** Add Vim-like or custom keyboard shortcuts for grading navigation.

---

## Files Reviewed

### Problem Management
- `src/app/(public)/problems/create/create-problem-form.tsx`
- `src/app/(public)/problems/create/page.tsx`
- `src/app/(public)/problems/[id]/edit/page.tsx`
- `src/app/(public)/problems/page.tsx`
- `src/components/problem/problem-import-button.tsx`
- `src/lib/problems/test-case-drafts.ts`

### Assignment Management
- `src/app/(public)/groups/[id]/assignment-form-dialog.tsx`
- `src/app/(public)/groups/[id]/page.tsx`
- `src/app/(public)/groups/[id]/assignments/[assignmentId]/page.tsx`
- `src/app/(public)/groups/[id]/assignments/[assignmentId]/status-board.tsx`
- `src/app/(public)/groups/[id]/assignments/[assignmentId]/score-override-dialog.tsx`
- `src/app/(public)/groups/[id]/assignments/[assignmentId]/student/[userId]/page.tsx`
- `src/lib/assignments/management.ts`
- `src/lib/validators/assignments.ts`

### Contest Management
- `src/app/(public)/contests/manage/[assignmentId]/page.tsx`
- `src/app/(public)/contests/manage/[assignmentId]/analytics/page.tsx`
- `src/components/contest/leaderboard-table.tsx`
- `src/components/contest/analytics-charts.tsx`
- `src/components/contest/export-button.tsx`
- `src/components/contest/anti-cheat-dashboard.tsx`
- `src/components/contest/participant-timeline-view.tsx`
- `src/components/contest/contest-announcements.tsx`
- `src/components/contest/access-code-manager.tsx`
- `src/lib/assignments/contest-scoring.ts`

### Enrollment
- `src/app/(public)/groups/[id]/group-members-manager.tsx`
- `src/app/(public)/groups/[id]/group-instructors-manager.tsx`

### Grading & Submissions
- `src/app/(dashboard)/dashboard/admin/submissions/page.tsx`
- `src/app/(dashboard)/dashboard/admin/submissions/admin-submissions-bulk-rejudge.tsx`
- `src/lib/assignments/submissions.ts`
- `src/lib/assignments/scoring.ts`
- `src/components/submissions/_components/comment-section.tsx`
- `src/components/submissions/output-diff-view.tsx`

### Schema & Data Model
- `src/lib/db/schema.pg.ts`
- `src/lib/db/schema.ts`

### Anti-Cheat
- `src/lib/anti-cheat/review-model.ts`

### Admin
- `src/app/(dashboard)/dashboard/admin/page.tsx`
- `src/app/(dashboard)/dashboard/_components/instructor-dashboard.tsx`

---

## Summary of Top Priority Fixes

| Priority | Finding | Effort |
|----------|---------|--------|
| 1 | Custom validator/checker support | High |
| 2 | Per-student deadline extensions | Medium |
| 3 | Manual grading UI for "manual" problem type | Medium |
| 4 | Test case breakdown in status board | Medium |
| 5 | CSV import for student enrollment | Low |
| 6 | LMS/gradebook integration (LTI) | High |
| 7 | Email/push notifications | Medium |
| 8 | Problem preview before publishing | Low |
| 9 | Anti-cheat false positive marking | Low |
| 10 | Team support for contests | High |
