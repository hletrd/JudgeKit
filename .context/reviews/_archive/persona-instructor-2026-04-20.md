# JudgeKit Instructor Review

**Reviewer persona**: University CS instructor, 10+ years teaching experience
**Date**: 2026-04-20
**Codebase**: /Users/hletrd/flash-shared/judgekit

---

## 1. Assignment Management

**Verdict: Solid, with frustrating gaps**

Creating an assignment is straightforward. The `AssignmentFormDialog` component (`src/app/(dashboard)/dashboard/groups/[id]/assignment-form-dialog.tsx`) covers the essentials: title, description, start/deadline/late-deadline timestamps, late penalty, exam mode, scoring model, and problem selection with per-problem point values. The dialog supports create, edit, and duplicate flows. Late penalty is a simple numeric field (0-100) -- clean enough.

**What works well:**
- Three exam modes (none/scheduled/windowed) with conditional fields that appear/hide appropriately. Windowed exams auto-strip late deadline/penalty since they are irrelevant -- good UX.
- Problem lock protection: once submissions exist, problems are locked. An admin override toggle exists but shows a warning.
- Duplicate assignment flow is a nice time-saver for reusing last semester's homework.

**What is painful:**
- **No timezone picker on assignment deadlines.** The form uses bare `<input type="datetime-local">` which renders in browser local time. If I am in Seoul and my server is in UTC, I have zero confidence the deadline is correct without checking. The system does have a `systemSettings.timeZone` and a `formatDateTimeInTimeZone` utility, but the *input* widget does not use it. I have been burned by this before on other platforms.
- **Late penalty is a flat number, not a percentage or schedule.** The schema stores `latePenalty` as a double with a non-negative check. The form label says "Late Penalty" with a 0-100 range, but there is no indication whether this is a percentage deduction, a flat point deduction, or a multiplier. Looking at the submission scoring code, this matters -- and the UI does not explain it.
- **No bulk assignment creation.** If I teach 5 sections of the same course, I must create the same assignment 5 times (once per group). The duplicate flow helps, but it is still 5 clicks + 5 form submissions.
- **No assignment templates.** Every semester I recreate the same "Week 3 Homework" structure. There is no way to save an assignment structure as a reusable template.

---

## 2. Problem Authoring

**Verdict: Surprisingly capable, but the description editor is primitive**

The problem editor (`src/app/(dashboard)/dashboard/problems/create/create-problem-form.tsx`) is comprehensive. It supports:
- Title, sequence number, difficulty (0-10 float), tags with autocomplete
- Description with write/preview tabs and image upload (paste and drag-and-drop)
- Time limit, memory limit, comparison mode (exact/float with configurable tolerances)
- Problem type (auto-graded vs. manual), visibility (public/private/hidden)
- Student visibility toggles (compile output, detailed results, runtime errors, AI assistant)
- Test cases with inline editing or file upload, visible/hidden toggle per test case
- ZIP import for test cases (`1.in`/`1.out` naming convention)

**What works well:**
- The ZIP import for test cases is a lifesaver. I can export from my old system and import directly. The `JSZip`-based parser supports `.in`/`.out`/`.input`/`.output`/`.ans` extensions with numeric pairing -- well thought out.
- Float comparison mode with configurable absolute/relative error tolerances -- essential for numerical problems. Not many platforms get this right.
- Test case locking after submissions exist, with admin override. This prevents accidentally changing test cases after students have submitted.
- Problem import/export via JSON (`/api/v1/problems/import` and `/api/v1/problems/[id]/export`). The export format (`version: 1`, full problem + test cases + tags) is clean and portable.
- Tag system with autocomplete suggestions.

**What is painful:**
- **The description editor is a bare `<Textarea>`.** There is a preview tab that renders via `ProblemDescription`, but no rich editing. If I want KaTeX math, I must type raw LaTeX and check the preview. There is no toolbar, no table builder, no code block shortcut. For a platform called "JudgeKit" where problem statements are the core content, this is the single biggest authoring pain point.
- **No collaborative editing.** Only the author or someone with `problems.edit` capability can edit. No commenting, no suggestion mode, no version history for descriptions.
- **No test case generation tooling.** For problems with many test cases, I still write a generator script externally, run it locally, zip the results, and upload. The platform could offer a "generate from script" feature.
- **Large test case handling is awkward.** The form collapses test cases over 5KB with a "Show Content" button, but editing a 50KB test case in a `<Textarea>` is miserable. There is no way to reference a file by path on the server instead of inlining content.

---

## 3. Exam Proctoring

**Verdict: Impressive for a self-hosted platform, but not a replacement for proctoring software**

The anti-cheat system is genuinely well-designed for what it is. The client-side monitor (`AntiCheatMonitor`) captures six event types: `tab_switch`, `copy`, `paste`, `blur`, `contextmenu`, and `heartbeat`. Events are sent to `/api/v1/contests/[assignmentId]/anti-cheat` and stored in the `antiCheatEvents` table with IP address, user agent, and timestamp.

The server-side anti-cheat API (`src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts`) includes:
- Rate-limited event logging from students
- Paginated event viewing for instructors
- **Heartbeat gap detection**: if a student's heartbeats have gaps >120 seconds, those gaps are reported. This is clever -- it catches students who might disable the monitor.
- IP address tracking per event and per exam session

The `AntiCheatDashboard` component (`src/components/contest/anti-cheat-dashboard.tsx`) provides:
- Summary stats (total events, unique students, top event type)
- Filterable event table by type and student
- Review tier classification (context/signal/escalate) via `review-model.ts`
- Inline code similarity check button

Exam session management (`src/lib/assignments/exam-sessions.ts`):
- Windowed exam mode: students click "Start Exam" and get a personal deadline = start time + duration, capped by the assignment deadline
- Exam sessions are idempotent (re-clicking start returns the existing session)
- IP address is recorded at session start
- Instructors can see all exam sessions via the API with start time and personal deadline

**What works well:**
- The three-tier review model (`context`/`signal`/`escalate`) is pedagogically sound. Tab switches are "context", copy/paste are "signals", IP changes and code similarity are "escalate". This prevents instructors from over-reacting to minor events.
- Heartbeat gap detection is a smart countermeasure against tech-savvy students who might kill the browser tab.
- The participant notice banner warns students they are being monitored -- ethically important.
- Exam sessions with personal deadlines handle accessibility accommodations naturally.

**What is painful:**
- **No webcam/microphone monitoring.** This is browser-only behavioral tracking. A determined student can use a second device. The platform acknowledges this with the disclaimer: "These signals are indicative, not conclusive evidence of misconduct."
- **No real-time instructor alerts.** Events are stored in the DB, but there is no push notification or live-updating dashboard. During a live exam, I have to manually refresh the anti-cheat page.
- **No exam pause/resume.** If a student has a bathroom break or technical issue, there is no way to pause their personal deadline. The instructor would need to manually adjust, which is not supported in the UI.
- **No browser lockdown.** The system relies on JavaScript events, which can be circumvented by disabling JavaScript or using a different browser that does not fire the expected events. The heartbeat gap detection partially mitigates this, but it is not foolproof.

---

## 4. Grading & Review

**Verdict: Good for auto-graded problems, minimal for subjective grading**

The `StatusBoard` component (`src/app/(dashboard)/dashboard/groups/[id]/assignments/[assignmentId]/status-board.tsx`) is the centerpiece of the grading workflow:
- Per-student rows showing total score, attempt count, status, last submission time
- Per-problem breakdown with best score, attempt count, latest submission link
- Summary statistics (mean, median, submitted count, perfect score count)
- Score override dialog per student per problem with reason field
- Override indicator (pen icon) visible on overridden scores
- Exam session status column (not started / in progress / completed) for windowed exams

The `ScoreOverrideDialog` (`src/app/(dashboard)/dashboard/groups/[id]/assignments/[assignmentId]/score-override-dialog.tsx`) is clean: enter override score, optional reason, save or remove. Overrides are stored in `score_overrides` table with audit trail (who created it, when, why).

Submission detail view (`src/app/(dashboard)/dashboard/submissions/[id]/submission-detail-client.tsx`):
- Full source code viewer with syntax highlighting
- Per-test-case result panel
- Comment section with line-level commenting
- Rejudge button (for instructors)
- Resubmit button (pre-fills the code editor)

The comment section (`src/app/(dashboard)/dashboard/submissions/[id]/_components/comment-section.tsx`) supports:
- Inline comments with line number references
- Author identification with role badges
- AI assistant comments (rendered with markdown)
- Plain text comments for humans

**What works well:**
- Score overrides with reasons and audit trail. This is essential for partial credit on manual review.
- The status board with real-time statistics is genuinely useful for tracking class progress at a glance.
- Line-level commenting on submissions. I can point to exactly which line has an issue.

**What is painful:**
- **Manual grading for "manual" problem type is barely supported.** The `problemType` field has an "auto" vs "manual" option, but manual grading essentially means "the instructor assigns a score manually." There is no rubric system, no grading criteria, no per-criterion scoring. I just type a number in the override dialog. For a class of 200 students with 3 subjective problems, this is agonizing.
- **No batch grading workflow.** I cannot "next submission" from one student to the next. I must go back to the status board, find the next student, click their submission, grade, go back. For 200 students, that is 200 navigation cycles.
- **No grading progress tracking.** I cannot mark a submission as "graded" or "needs review." There is no way to see "I have graded 47 of 200 students."
- **No anonymous grading mode.** Student names are always visible. In a fair grading process, I would prefer to hide names until after scoring.
- **The comment section does not support rubric-style feedback.** I can write free-text comments, but there is no structured feedback template (e.g., "-5 points: missing edge case, -3 points: poor variable naming").

---

## 5. Analytics

**Verdict: Functional but shallow**

Two analytics views exist:

**Group analytics** (`src/app/(dashboard)/dashboard/groups/[id]/analytics/page.tsx`):
- Member count, assignment count, total submissions, average overall score
- Per-assignment table: title, total points, submitted count with percentage, average/high/low score, deadline

**Contest analytics** (`src/components/contest/analytics-charts.tsx`):
- Score distribution histogram (SVG bar chart)
- Per-problem solve rates (stacked bar: solved/partial/zero)
- Per-problem solve times (median and mean in minutes)
- Anti-cheat event summary with breakdown by type
- Score progression timeline chart per student

The contest analytics page also has an export button that generates CSV.

**What works well:**
- The score distribution and solve rate visualizations are useful for post-exam analysis. The stacked bar chart for solve rates (green/yellow/red) is immediately readable.
- The score progression timeline showing student trajectories over time is valuable for understanding when students hit walls.
- The group analytics page gives a decent overview of class performance across assignments.

**What is painful:**
- **No per-problem difficulty discrimination index.** I cannot see which problems differentiate between strong and weak students (point-biserial correlation). This is standard in psychometric analysis of exams.
- **No score distribution by class/section.** If I teach multiple sections, I cannot compare their performance side-by-side.
- **No export of analytics data.** The CSV export on the contest page exports student grades, not analytics. I cannot export the score distribution or solve rates for my own analysis.
- **The SVG charts are custom-built.** They work, but they are not interactive (no hover tooltips on bars, no zoom, no click-to-filter). For a data-rich platform, this feels like a missed opportunity. A charting library (Recharts, Chart.js) would provide much better UX.
- **No longitudinal analytics.** I cannot track how a cohort performs across multiple assignments over the semester. The group analytics page shows per-assignment stats but no trend lines.

---

## 6. Contest Organization

**Verdict: Comprehensive -- this is clearly the strongest feature**

The contest detail page (`src/app/(dashboard)/dashboard/contests/[assignmentId]/page.tsx`) is a full contest management console with tabbed interface:
- **Overview tab**: Announcements, clarifications, assignment details, access code manager, invite participants
- **Submissions tab**: Status board with filters
- **Leaderboard tab**: Full leaderboard with IOI/ICPC scoring
- **Analytics tab**: Charts and statistics
- **Anti-Cheat tab**: (conditional) Dashboard with similarity check
- **Candidates tab**: Recruiting candidates panel
- **Invitations tab**: Recruiting invitations management

The `LeaderboardTable` (`src/components/contest/leaderboard-table.tsx`) supports:
- IOI scoring: total score with gradient-colored per-problem cells
- ICPC scoring: solved count + penalty, with attempt indicators (+, -N)
- Leaderboard freeze (visual snowflake badge, blue border)
- Live rank for current user during freeze
- Auto-refresh (30-second intervals, pauses when tab hidden)
- Podium highlighting (gold/silver/bronze rows)
- Affiliation (class) column when present

Contest creation includes:
- Quick-create form for rapid contest setup
- Access code management for external participants
- Recruiting invitations for hiring events
- Contest announcements and clarifications system

**What works well:**
- The dual scoring model (IOI + ICPC) with proper leaderboard rendering. The ICPC format with penalty calculation and color-coded cells is competition-grade.
- Leaderboard freeze with live rank for the current user -- this is exactly how real ICPC contests work.
- Announcements and clarifications are first-class features. Students can ask clarification questions, instructors can answer and make them public.
- Access code + invitation system handles both enrolled students and external participants.

**What is painful:**
- **No contest problem reordering UI.** Problem sort order is stored in `assignmentProblems.sortOrder`, but I could not find a drag-and-drop reordering interface. I would need to edit the database or re-add problems in the right order.
- **No contest template/cloning across groups.** I can duplicate an assignment within the same group, but I cannot easily run the same contest across multiple groups simultaneously.
- **No balloon/notification system for ICPC.** In real ICPC contests, teams get balloons when they solve problems. This is a nice-to-have, not critical.
- **The clarifications system does not support rich text.** Questions and answers are plain text only.

---

## 7. TA Management

**Verdict: Adequate but limited**

The `GroupInstructorsManager` (`src/app/(dashboard)/dashboard/groups/[id]/group-instructors-manager.tsx`) provides:
- Add co-instructors and TAs by selecting from a user dropdown with search
- Role assignment: "co_instructor" or "ta"
- Remove instructors from the group

The `groupInstructors` table stores: groupId, userId, role ("co_instructor" | "ta"), assignedAt.

The capability system (`src/lib/capabilities/defaults.ts`) defines five built-in roles:
- **Student**: submit solutions, view own submissions
- **Assistant** (TA): student + view all submissions, view source, view assignment status, view all problems, view anti-cheat events, upload files
- **Instructor**: assistant + create/edit/delete problems, manage groups/assignments, rejudge, comment, manage problem sets, manage contests, moderate community, manage recruiting, run similarity checks
- **Admin**: instructor + manage users, system settings, backup, audit logs
- **Super Admin**: all capabilities

**What works well:**
- The role-based capability system is granular and well-structured. 40+ capabilities cover every aspect of the platform.
- TAs can view submissions and source code but cannot rejudge or modify assignments. This is the right permission boundary.
- Custom roles are supported at the database level (the `roles` table is not hardcoded).

**What is painful:**
- **The "ta" role in `groupInstructors` is disconnected from the "assistant" system role.** The group instructor role is just a label ("co_instructor" or "ta") stored in the junction table. It does not map to the capability system. A user with system role "student" can be added as a group "ta" but would still lack the `submissions.view_all` capability. The group-level TA role appears to be purely cosmetic -- it shows a badge in the UI but does not grant permissions.
- **No per-assignment TA assignment.** TAs are assigned at the group level. If I have 5 TAs and 10 assignments, I cannot assign TA-A to grade assignments 1-5 and TA-B to grade assignments 6-10.
- **No TA workload tracking.** I cannot see how many submissions each TA has reviewed or commented on.
- **Bulk TA addition is not supported.** I must add TAs one at a time through the dropdown.

---

## 8. Plagiarism Detection

**Verdict: Honest but limited -- you get what you pay for**

The code similarity system has two implementations:

**TypeScript fallback** (`src/lib/assignments/code-similarity.ts`):
- Normalizes source code: strips comments, whitespace, string literals; preserves preprocessor directives
- Normalizes identifiers: replaces user-defined identifiers with placeholder variables (v1, v2, ...) while preserving keywords across C/C++/Java/Python/Rust
- Generates n-grams (token-based, default size 3)
- Computes Jaccard similarity between all pairs within same (problem, language) group
- Time-based yielding to prevent event loop blocking
- Hard limit: 500 submissions max

**Rust sidecar** (`code-similarity-rs/`):
- Axum-based HTTP service on port 3002
- Same normalization and n-gram approach, but runs on rayon thread pool
- Bearer token authentication
- 16MB body size cap
- Preferred when available; TS fallback used when sidecar is down

The similarity check is triggered manually by the instructor from the anti-cheat dashboard. Results are stored as `antiCheatEvents` with type `code_similarity` and enriched with usernames. Pairs are sorted by similarity percentage and displayed in a table.

**What works well:**
- The normalization pipeline is thoughtful. Stripping comments, normalizing whitespace, and replacing identifiers catches the most common obfuscation techniques (variable renaming, comment additions, whitespace changes).
- The two-tier architecture (Rust sidecar for production, TS fallback for development) is practical.
- The 85% default threshold is reasonable -- it filters out incidental similarity.
- Results are stored persistently as anti-cheat events, so they survive page refreshes.
- The "escalate" tier for code similarity in the review model is appropriate.

**What is painful:**
- **Jaccard similarity on token n-grams is a weak plagiarism detector.** It catches copy-paste with variable renaming but fails against:
  - Statement reordering (very common)
  - Control structure changes (if/else to switch, for to while)
  - Adding/removing intermediate variables
  - Using different algorithmic approaches to the same problem
- **No AST-based comparison.** Real plagiarism detectors (MOSS, JPlag) use AST or token-sequence comparison with winnowing. The n-gram approach here is closer to a grep than a real similarity tool.
- **500 submission limit for the TS fallback.** For a large class (200 students x 5 problems = 1000 best submissions), the TS fallback refuses to run. The Rust sidecar has no documented limit, but it also uses the same algorithm.
- **No visual diff view.** When a pair is flagged, I see a similarity percentage and the two student names, but I cannot see a side-by-side diff of their code. I must manually open both submissions and compare. This makes verification extremely tedious.
- **No historical tracking.** The old similarity events are deleted and replaced each time the check is run. I cannot see how similarity changed over time as the assignment progressed.
- **One-at-a-time manual trigger.** I must remember to run the check. There is no automatic post-deadline check or scheduled analysis.

---

## 9. Bulk Operations

**Verdict: API-complete, UI-incomplete**

**Bulk user creation** (`src/app/api/v1/users/bulk/route.ts`):
- Accepts array of users with username, name, email, password, className, role
- Parallel password hashing (4 concurrent)
- PostgreSQL savepoints for atomic per-user insertion (one failure does not abort the batch)
- Returns created and failed lists with reasons
- Rate-limited
- Audit event logged

**Bulk group enrollment** (`src/app/api/v1/groups/[id]/members/bulk/route.ts`):
- Accepts array of user IDs
- Enrolls users into the group
- The UI (`GroupMembersManager`) supports checkbox-based bulk enrollment from available students

**Assignment export** (`src/app/api/v1/groups/[id]/assignments/[assignmentId]/export/route.ts`):
- CSV export with BOM for Excel compatibility
- Columns: Student Name, Username, Class, Status, Score, Submitted At
- 10,000 row hard cap to prevent OOM
- Proper content-disposition header

**Problem export/import**:
- JSON format with version field
- Includes all problem metadata, test cases, and tags

**What works well:**
- The bulk user creation API is production-grade. Savepoints, parallel hashing, detailed error reporting -- this was clearly built by someone who has had to create 200 student accounts before.
- CSV export with BOM for Excel UTF-8 compatibility. This is the kind of detail that saves hours of "why are the Korean characters garbled" debugging.
- The bulk enrollment UI with select-all and checkbox list is intuitive.

**What is painful:**
- **No CSV import for users.** The bulk create API accepts JSON, but there is no UI to upload a CSV/Excel file of student rosters. I must write a script or use curl. For a platform targeting instructors, this is a major gap. Every semester I get a class roster in Excel format.
- **No CSV import for group enrollment.** I can bulk-enroll from the "available students" list, but I cannot upload a list of student IDs or usernames.
- **Assignment export is grade-only.** I cannot export the assignment configuration (problems, test cases, settings) for backup or transfer. The problem-level export exists, but there is no assignment-level export that bundles all problems together.
- **No submission export with source code.** The assignment export gives me grades, but I cannot bulk-download all student source code for offline review or archival.

---

## 10. Pain Points & Missing Features

### Things That Take Too Long

1. **Creating a multi-problem assignment from scratch.** I must: create each problem separately, then create the assignment, then add problems one by one in the dialog. For a 10-problem homework, that is 10 problem creation cycles + 1 assignment creation + 10 problem additions. A "create assignment with problems inline" workflow would cut this in half.

2. **Grading subjective problems for a large class.** No batch workflow, no rubric, no anonymous mode. For 200 students, this takes an entire weekend instead of a few hours.

3. **Verifying plagiarism flags.** I see "Student A and Student B: 92% similarity" but I must open both submissions in separate tabs and manually compare. A side-by-side diff view would reduce this from 5 minutes per pair to 30 seconds.

### Things That Are Missing

1. **No course/semester concept.** Groups are flat. I cannot organize groups by semester or course. After 4 semesters of teaching, I would have 20+ groups with no way to archive old ones except the `isArchived` flag.

2. **No email notification system.** When an assignment deadline approaches, when a submission is graded, when an announcement is posted -- no emails. The platform is entirely pull-based.

3. **No LMS integration.** No LTI support, no Canvas/Blackboard/Moodle integration. Grades must be manually transferred.

4. **No question bank.** Problems exist in a flat pool. I cannot organize them by topic, difficulty range, or learning objective in a structured way that supports random selection for exams.

5. **No regrading workflow.** If I discover a test case is wrong after 100 students have submitted, I can fix the test case and rejudge, but there is no "regrade with notification" flow. Students do not get notified that their score changed.

6. **No late submission enforcement in the judge.** The `lateDeadline` and `latePenalty` fields exist in the schema, but I could not find where the late penalty is actually applied to the score during grading. The submission scoring appears to store raw scores, and the penalty would need to be applied at display time. This needs verification -- if late penalties are not enforced, the feature is cosmetic.

7. **No partial submission visibility for instructors.** During a live exam, I cannot see what students are currently typing. I can only see submitted code. For proctoring purposes, the code snapshot feature (`codeSnapshots` table, `CodeTimelinePanel`) partially addresses this, but it appears to be opt-in and not real-time.

### What Would Make Me Switch to Another Platform

- If I needed robust manual grading with rubrics and peer review (PrairieLearn, Gradescope)
- If I needed real proctoring with webcam monitoring (Examity, Proctorio)
- If I needed LMS integration (Canvas, Blackboard)
- If I needed sophisticated plagiarism detection (MOSS, Turnitin)

### What Would Make Me Stay

JudgeKit has the best self-hosted contest management I have seen. The combination of:
- IOI + ICPC scoring with proper leaderboard freeze
- Windowed exam mode with personal deadlines
- Anti-cheat monitoring with tiered review model
- Rust-accelerated similarity checking
- Comprehensive role-based access control
- Clean, responsive UI with dark mode and i18n

...is a compelling package for a university that wants full control over their judging infrastructure. If the manual grading workflow and analytics depth were improved, this would be a genuine competitor to commercial platforms for course use cases, not just contest use cases.

---

## Summary Ratings

| Area | Rating (1-5) | Notes |
|------|:---:|-------|
| Assignment Management | 3.5 | Good fundamentals, missing timezone handling and templates |
| Problem Authoring | 3.5 | Strong test case tooling, weak description editor |
| Exam Proctoring | 3.5 | Best-in-class for browser-only, no webcam/lockdown |
| Grading & Review | 2.5 | Great for auto-graded, painful for subjective |
| Analytics | 3.0 | Functional charts, missing psychometric depth |
| Contest Organization | 4.5 | Clearly the strongest feature, competition-grade |
| TA Management | 2.5 | Role system disconnected from group-level TA role |
| Plagiarism Detection | 2.5 | Honest but weak algorithm, no diff view |
| Bulk Operations | 3.0 | Solid APIs, missing CSV import UI |
| Overall | 3.2 | Excellent contest platform, needs work for course management |

---

*This review is based on source code analysis as of 2026-04-20. All file references point to the codebase at `/Users/hletrd/flash-shared/judgekit`.*
