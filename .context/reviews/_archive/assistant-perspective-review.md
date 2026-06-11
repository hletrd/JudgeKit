# JudgeKit TA Perspective Review

**Date:** 2026-05-10
**Reviewer:** Teaching Assistant (TA) Perspective
**Scope:** Full codebase review from a TA's viewpoint -- supporting students, reviewing submissions, providing feedback, monitoring exams, and collaborating with instructors.

---

## Inventory of TA-Facing Files Reviewed

### Submission Viewing & Review
- `src/app/(public)/submissions/page.tsx` -- Public submission list
- `src/app/(public)/submissions/[id]/page.tsx` -- Submission detail (public route)
- `src/components/submissions/submission-detail-client.tsx` -- Submission detail UI
- `src/components/submissions/_components/submission-result-panel.tsx` -- Test results panel
- `src/components/submissions/_components/comment-section.tsx` -- Comments on submissions
- `src/components/submissions/_components/live-submission-status.tsx` -- Live status
- `src/components/submissions/output-diff-view.tsx` -- Diff output viewer
- `src/app/api/v1/submissions/[id]/comments/route.ts` -- Comments API
- `src/app/api/v1/submissions/[id]/route.ts` -- Single submission API
- `src/app/api/v1/submissions/route.ts` -- Submissions list API
- `src/lib/submissions/visibility.ts` -- Submission visibility sanitization

### Assignment & Group Management
- `src/app/(public)/groups/page.tsx` -- Group list
- `src/app/(public)/groups/[id]/page.tsx` -- Group detail
- `src/app/(public)/groups/[id]/assignments/[assignmentId]/page.tsx` -- Assignment detail
- `src/app/(public)/groups/[id]/assignments/[assignmentId]/status-board.tsx` -- Status board
- `src/app/(public)/groups/[id]/assignments/[assignmentId]/student/[userId]/page.tsx` -- Student submissions
- `src/app/(public)/groups/[id]/assignments/[assignmentId]/score-override-dialog.tsx` -- Score override
- `src/app/(public)/groups/[id]/group-instructors-manager.tsx` -- Instructor/TA management
- `src/lib/assignments/submissions.ts` -- Assignment submission logic
- `src/lib/assignments/scoring.ts` -- Scoring logic
- `src/lib/assignments/management.ts` -- Group resource management
- `src/lib/assignments/exam-sessions.ts` -- Exam session logic
- `src/lib/assignments/participant-status.ts` -- Participant status

### Exam & Anti-Cheat Monitoring
- `src/components/exam/anti-cheat-monitor.tsx` -- Anti-cheat client monitor
- `src/components/contest/anti-cheat-dashboard.tsx` -- Anti-cheat dashboard
- `src/components/contest/participant-anti-cheat-timeline.tsx` -- Per-student anti-cheat
- `src/components/contest/participant-timeline-view.tsx` -- Participant timeline
- `src/components/contest/code-timeline-panel.tsx` -- Code snapshot timeline
- `src/lib/anti-cheat/review-model.ts` -- Review tier model

### Communication & Collaboration
- `src/components/contest/contest-announcements.tsx` -- Contest announcements
- `src/components/contest/contest-clarifications.tsx` -- Q&A / clarifications
- `src/components/discussions/discussion-thread-view.tsx` -- Discussion threads

### Dashboards
- `src/app/(public)/dashboard/_components/student-dashboard.tsx`
- `src/app/(public)/dashboard/_components/instructor-dashboard.tsx`

### Permissions & Roles
- `src/lib/auth/permissions.ts` -- Access control
- `src/lib/capabilities/defaults.ts` -- Role capabilities
- `src/lib/capabilities/types.ts` -- Capability types

### Misc
- `src/components/code/code-viewer.tsx` -- Code display
- `src/hooks/use-keyboard-shortcuts.ts` -- Keyboard shortcuts
- `src/lib/realtime/realtime-coordination.ts` -- Realtime coordination
- `src/lib/db/schema.pg.ts` -- Database schema

---

## 1. Submission Review Workflow

### Finding 1.1: Submission detail page uses `capabilities=[]` for all non-owners, blocking TA access to comments and rejudging
**File:** `src/app/(public)/submissions/[id]/page.tsx:188`
**Code:**
```tsx
<SubmissionDetailClient
  ...
  capabilities={[]}
  ...
/>
```
**TA Impact:** The public submission detail page hardcodes an empty capabilities array. This means even authenticated TAs visiting a submission detail page through the public route get zero capabilities -- they cannot comment, cannot rejudge, and the UI renders as if they are mere observers. TAs must navigate through assignment-specific routes to get proper capability injection, but those are gated behind `canViewAssignmentSubmissions()` which requires `assignments.view_status` capability. A TA with that capability visiting `/submissions/[id]` directly from a notification or link gets a broken experience.
**Severity:** HIGH
**Suggested Fix:** Pass the user's actual resolved capabilities into `SubmissionDetailClient` on the public submission detail page, similar to how the assignment-specific pages do it.

### Finding 1.2: No side-by-side code diff for submission review
**File:** `src/components/submissions/output-diff-view.tsx`
**TA Impact:** The diff viewer only shows output diffs (expected vs actual). There is no way for a TA to see a diff between a student's successive submissions for the same problem. When a student submits 10 times, the TA must manually open each submission in a separate tab and mentally diff them. This is extremely inefficient for debugging why a student's approach changed.
**Severity:** MEDIUM
**Suggested Fix:** Add a "Compare with previous submission" feature on the submission detail page that shows a code-level diff between consecutive submissions.

### Finding 1.3: No syntax highlighting in code viewer for review
**File:** `src/components/code/code-viewer.tsx`
**TA Impact:** The `CodeViewer` component uses either a raw textarea (for "raw" languages) or a dynamic `CodeSurface` component. However, the `CodeSurface` is loaded dynamically with SSR disabled, causing a skeleton flash on every page load. More critically, there is no way for a TA to toggle line numbers, wrap lines, or change font size during review -- all of which are essential for reading poorly formatted student code.
**Severity:** LOW
**Suggested Fix:** Add review-mode toggles (line numbers on/off, word wrap, font size) to `CodeViewer`.

### Finding 1.4: No bulk submission review workflow
**File:** `src/app/(public)/groups/[id]/assignments/[assignmentId]/status-board.tsx`
**TA Impact:** The status board shows all students in a grid, but clicking any submission takes the TA to a full page reload. There is no "next submission" / "previous submission" navigation, no keyboard shortcuts for rapid review, and no way to mark submissions as "reviewed" or "needs follow-up". A TA grading 50 submissions must endure 50 full page loads with no progress tracking.
**Severity:** HIGH
**Suggested Fix:** Add a "review mode" overlay that loads submissions in a modal/lightbox with next/prev navigation, keyboard shortcuts (j/k for next/prev), and review state tracking.

---

## 2. Feedback Mechanisms

### Finding 2.1: Comments are plain text only -- no inline code formatting, no rich feedback
**File:** `src/components/submissions/_components/comment-section.tsx:131`
**Code:**
```tsx
<p className="text-sm whitespace-pre-wrap">{comment.content}</p>
```
**TA Impact:** Human-authored comments are rendered as plain text with `whitespace-pre-wrap`. TAs cannot use markdown, code blocks, or links in their feedback. Explaining "you should use a binary search here" is much harder without being able to format code snippets. AI comments get full `AssistantMarkdown` rendering (`line 127-129`), but human TA comments do not -- creating an ironic asymmetry where AI feedback looks better than human feedback.
**Severity:** HIGH
**Suggested Fix:** Render human comments through `AssistantMarkdown` as well, or provide a rich text editor for TA comments.

### Finding 2.2: Comments cannot be edited or deleted by the author
**File:** `src/components/submissions/_components/comment-section.tsx` (entire file)
**TA Impact:** The comment section has no edit or delete functionality. If a TA makes a typo or realizes their feedback was wrong, they cannot fix it. They must post a follow-up comment saying "ignore my previous comment" -- confusing for students and unprofessional.
**Severity:** HIGH
**Suggested Fix:** Add edit/delete buttons to comments, gated to the comment author and instructors.

### Finding 2.3: No comment threading or replies
**File:** `src/components/submissions/_components/comment-section.tsx`
**TA Impact:** Comments are a flat list. If a student replies to TA feedback, the reply appears as a new top-level comment with no visual connection to the original. This makes back-and-forth debugging conversations impossible to follow.
**Severity:** MEDIUM
**Suggested Fix:** Add threaded replies to comments, or at minimum, allow students to respond to specific TA comments.

### Finding 2.4: Line-numbered comments exist but line selection UX is poor
**File:** `src/components/submissions/_components/comment-section.tsx:69-70`
**Code:**
```tsx
body: JSON.stringify({ content: commentContent.trim(), lineNumber: targetLine }),
```
**TA Impact:** While the comment system supports `lineNumber`, the `CodeViewer` component provides no clickable line numbers or visual indication of which lines have comments. A TA must manually remember which line they wanted to comment on, scroll down to the comment box, and type the line number (or hope the UI preserved it). There is no visual annotation in the code itself.
**Severity:** MEDIUM
**Suggested Fix:** Add clickable line numbers to `CodeViewer` that scroll-to and pre-fill the comment form. Show comment badges/icons on lines that have comments.

### Finding 2.5: No rubric-based or structured feedback
**File:** (missing -- no rubric system exists)
**TA Impact:** There is no rubric system, no canned feedback templates, no checkbox-based feedback (e.g., "Time complexity: O(n) expected" / "Code style: variable naming"). Every TA must write free-text feedback for every submission from scratch. This is inconsistent, slow, and produces variable quality feedback.
**Severity:** HIGH
**Suggested Fix:** Add a rubric system per-problem where instructors define criteria (e.g., "Algorithm correctness", "Code style", "Edge case handling") with point scales, and TAs can score each criterion with optional free-text elaboration.

### Finding 2.6: Score override has no audit trail visible to TAs
**File:** `src/lib/db/schema.pg.ts:652-683` (scoreOverrides table)
**TA Impact:** The `scoreOverrides` table stores `createdBy` and `reason`, but the `ScoreOverrideDialog` (`score-override-dialog.tsx`) only shows the current override indicator (a pencil icon). There is no way for a TA to see WHO overrode a score, WHEN, and WHY without querying the database directly. When multiple TAs/instructors are reviewing, this creates confusion about why a score differs from the auto-grader.
**Severity:** MEDIUM
**Suggested Fix:** Show the override history (who, when, why) in a tooltip or expandable section on the status board and score override dialog.

---

## 3. Student Communication

### Finding 3.1: Clarifications exist but lack urgency/priority markers
**File:** `src/components/contest/contest-clarifications.tsx`
**TA Impact:** The clarification system treats all questions equally. During an active exam, a student asking "Is the input guaranteed to be sorted?" and another asking "The judge says my perfectly correct solution is wrong" both appear as identical cards. There is no way for TAs to mark questions as urgent, pin important clarifications, or see which questions have been waiting longest.
**Severity:** MEDIUM
**Suggested Fix:** Add priority/urgency markers to clarifications, sort unanswered questions by age, and allow TAs to mark questions as "urgent" or "requires broadcast answer".

### Finding 3.2: No direct messaging between TA and student
**File:** (missing -- no DM system)
**TA Impact:** The only communication channels are: (1) public announcements (broadcast to all), (2) clarifications (public or private Q&A), and (3) submission comments (attached to specific submissions). There is no way for a TA to DM a student saying "I noticed you seem stuck on problem 3, want to hop on a quick call?" or "Can you clarify your approach in problem 2?" This forces all communication to be either fully public or submission-specific.
**Severity:** MEDIUM
**Suggested Fix:** Add a lightweight direct messaging system, or at minimum, allow TAs to send notifications to specific students that appear in their dashboard.

### Finding 3.3: Announcements are not targeted to subsets of students
**File:** `src/components/contest/contest-announcements.tsx`
**TA Impact:** Announcements are broadcast to all participants. A TA cannot send an announcement to just "students who haven't submitted yet" or "students currently in exam session". This reduces the signal-to-noise ratio during active exams.
**Severity:** LOW
**Suggested Fix:** Add targeting filters to announcements (e.g., by submission status, by exam session state).

---

## 4. Exam Monitoring

### Finding 4.1: Anti-cheat dashboard shows events but no real-time alerting
**File:** `src/components/contest/anti-cheat-dashboard.tsx`
**TA Impact:** The anti-cheat dashboard is a passive polling view (30s interval). It shows events in a table, but there is no push notification, sound alert, or visual alarm when a high-severity event occurs (like `ip_change` or `code_similarity`). A TA monitoring 50 students during an exam must manually refresh and scan the table for new events. By the time they notice an `ip_change`, the student may have already submitted.
**Severity:** HIGH
**Suggested Fix:** Add real-time push notifications (browser notification + sound) for `escalate`-tier events, and a prominent "active alerts" banner that doesn't require scrolling.

### Finding 4.2: No live "who is currently active" view during exams
**File:** (missing -- no active session monitor)
**TA Impact:** During a windowed exam, there is no centralized view showing which students are currently taking the exam, which have started but are idle, and which have finished. The status board shows overall progress but not real-time activity. A TA cannot see "Student A has been on the same problem for 45 minutes with no submissions" or "Student B just had 3 rapid tab switches."
**Severity:** HIGH
**Suggested Fix:** Add a "Live Exam Monitor" view showing: current active sessions, time elapsed per student, last anti-cheat event per student, last submission time, and idle time.

### Finding 4.3: Anti-cheat events lack geolocation context
**File:** `src/components/contest/anti-cheat-dashboard.tsx:568`
**Code:**
```tsx
<TableCell className="font-mono text-sm text-muted-foreground">
  {event.ipAddress ?? "-"}
</TableCell>
```
**TA Impact:** When an `ip_change` event fires, the TA sees two raw IP addresses but no geolocation data, ISP info, or VPN detection. Determining if a student switched from campus WiFi to a mobile hotspot vs. switched to a VPN in another country requires manual lookup.
**Severity:** MEDIUM
**Suggested Fix:** Add IP geolocation display (city/country, ISP, VPN/proxy detection flags) to anti-cheat events.

### Finding 4.4: No intervention mechanism from anti-cheat dashboard
**File:** `src/components/contest/anti-cheat-dashboard.tsx`
**TA Impact:** When a TA sees suspicious activity, there is no "flag student", "pause exam", "send warning", or "require re-verification" action available from the dashboard. The TA must navigate to a separate page, find the student, and take action manually. In a time-sensitive exam context, this delay is problematic.
**Severity:** MEDIUM
**Suggested Fix:** Add inline actions on anti-cheat events: "Send warning to student", "Flag for instructor review", "View participant timeline".

### Finding 4.5: Code timeline panel shows snapshots but no diff between them
**File:** `src/components/contest/code-timeline-panel.tsx`
**TA Impact:** The code timeline shows periodic snapshots of student code during an exam, but there is no diff view between snapshots. A TA trying to detect if a student pasted in pre-written code must manually compare snapshots side-by-side.
**Severity:** MEDIUM
**Suggested Fix:** Add a "Show changes since last snapshot" toggle that highlights added/removed lines between consecutive snapshots.

---

## 5. Grading Assistance

### Finding 5.1: No manual grading support for non-auto-graded problems
**File:** `src/lib/db/schema.pg.ts:261`
**Code:**
```ts
problemType: text("problem_type").notNull().default("auto"),
```
**TA Impact:** While the schema supports `problemType: "manual"`, there is no UI for TAs to actually perform manual grading. The `manual` type exists in the schema but the submission flow (`src/app/api/v1/submissions/route.ts:240`) sets status to `"submitted"` for manual problems, and then... nothing. There is no TA grading interface, no rubric scoring, no "approve/reject with feedback" workflow.
**Severity:** CRITICAL
**Suggested Fix:** Build a manual grading interface where TAs can review manual submissions, assign scores, and provide structured feedback.

### Finding 5.2: No grader confidence indicator for auto-graded results
**File:** `src/components/submissions/_components/submission-result-panel.tsx`
**TA Impact:** The submission result panel shows pass/fail for each test case, but gives no indication of grader confidence. Edge cases like "output has trailing whitespace difference" vs "completely wrong algorithm" are both shown as `wrong_answer` with the same red badge. A TA trying to help a student understand why they failed cannot see if the failure was close (e.g., off by formatting) or far (wrong answer entirely).
**Severity:** MEDIUM
**Suggested Fix:** For `wrong_answer` results, show a "difference magnitude" metric (e.g., character difference count, line count difference) to help TAs and students understand the severity.

### Finding 5.3: No calibration or inter-rater reliability tracking
**File:** (missing -- no grading analytics)
**TA Impact:** When multiple TAs grade the same assignment (especially with manual overrides), there is no tracking of score variance between graders. An instructor cannot see "TA Alice averages 85 points while TA Bob averages 70 points for the same problem" or "TA Charlie overrides scores 3x more often than others."
**Severity:** MEDIUM
**Suggested Fix:** Add grader analytics showing score distributions per-TA, override frequency, and average grading time.

### Finding 5.4: Score override reason is optional and unstructured
**File:** `src/app/(public)/groups/[id]/assignments/[assignmentId]/score-override-dialog.tsx:91`
**Code:**
```tsx
reason: reason.trim() || undefined,
```
**TA Impact:** The score override dialog makes the reason field optional (`undefined` if empty). This means TAs can override scores without explaining why, creating audit gaps. When a student questions their grade, there may be no record of why the override happened.
**Severity:** MEDIUM
**Suggested Fix:** Make the reason field mandatory for score overrides, and provide a dropdown of common reasons ("Partial credit for correct approach", "Bonus for optimization", "Penalty for plagiarism", "Grading error correction").

---

## 6. Office Hours Integration

### Finding 6.1: No office hours queue or scheduling system
**File:** (missing -- no office hours feature exists)
**TA Impact:** There is no office hours queue, no appointment scheduling, no "I'm stuck on problem X" signaling system. Students and TAs must coordinate outside the platform (email, Slack, etc.). During busy periods before deadlines, TAs have no visibility into which students need help and on what topics.
**Severity:** HIGH
**Suggested Fix:** Add an office hours queue where students can request help (optionally specifying topic/problem), and TAs can see the queue, claim students, and mark sessions as resolved.

### Finding 6.2: No session notes or follow-up tracking
**File:** (missing -- no session notes)
**TA Impact:** After a TA helps a student during office hours, there is no way to log what was discussed, what concepts were explained, or what follow-up actions were recommended. The next TA who interacts with the same student has no context.
**Severity:** MEDIUM
**Suggested Fix:** Add per-student notes visible to instructional staff (TAs and instructors), with timestamps and author attribution.

---

## 7. Collaboration with Instructors

### Finding 7.1: No shared notes or handoff system between TAs and instructors
**File:** (missing -- no shared notes)
**TA Impact:** When a TA identifies a struggling student, a suspicious anti-cheat pattern, or a problem with an assignment, they have no in-platform way to escalate or hand off to the instructor. They must use external communication (email, Slack) which is not tied to the specific student/assignment context.
**Severity:** HIGH
**Suggested Fix:** Add an "internal notes" or "flags" system on students, assignments, and submissions that is visible only to instructional staff (instructors + TAs), with @mention support for escalation.

### Finding 7.2: No TA activity log or "what did my TAs do today" view for instructors
**File:** (missing -- no TA activity dashboard)
**TA Impact:** Instructors have no visibility into TA workload or activity. They cannot see which TAs reviewed which submissions, how many comments were left, or which scores were overridden. This makes it impossible for instructors to coach TAs or distribute work evenly.
**Severity:** MEDIUM
**Suggested Fix:** Add a TA activity dashboard visible to instructors showing: submissions reviewed per TA, comments left, overrides made, average time spent per review, and anti-cheat events handled.

### Finding 7.3: TA role is binary -- no granular TA permissions per-group
**File:** `src/lib/capabilities/defaults.ts:15-34`
**Code:**
```ts
const ASSISTANT_CAPABILITIES: readonly Capability[] = [
  ...STUDENT_CAPABILITIES,
  "submissions.view_source",
  "submissions.comment",
  "submissions.rejudge",
  "assignments.view_status",
  "problems.view_all",
  "anti_cheat.view_events",
  "anti_cheat.run_similarity",
  "files.upload",
];
```
**TA Impact:** All TAs ("assistant" role) get the same global capabilities. There is no per-group permission variation. A TA assigned to Group A can view submissions and anti-cheat data for Group B if they are also enrolled there. The `groupInstructors` table has a `role` field (`"co_instructor" | "ta"`), but the capability system does not differentiate between them -- TAs and co-instructors have the same `assistant` system role.
**Severity:** MEDIUM
**Suggested Fix:** Make the `groupInstructors.role` field influence effective capabilities per-group. A "ta" in a group should have fewer capabilities than a "co_instructor".

---

## 8. Analytics for Struggling Students

### Finding 8.1: No early warning system for struggling students
**File:** `src/app/(public)/groups/[id]/assignments/[assignmentId]/status-board.tsx`
**TA Impact:** The status board shows raw scores and attempt counts, but provides no "at-risk" highlighting. A TA must manually scan 50+ rows to find students with 0 submissions, many wrong answers, or declining performance. There is no automatic flag for "student has 5 compile errors in a row" or "student hasn't submitted in 2 hours during an exam."
**Severity:** HIGH
**Suggested Fix:** Add automatic "at-risk" badges to students based on rules: 0 submissions after 50% of deadline, 3+ compile errors in a row, no activity in last X minutes during exam, score declining across attempts.

### Finding 8.2: No per-student submission pattern analysis
**File:** (missing -- no pattern analysis)
**TA Impact:** The platform shows individual submissions but does not aggregate patterns like "Student submits every 2 minutes with small changes" (tweaking output format) vs "Student submits once after 30 minutes" (confident solver). These patterns are valuable for TAs to understand student struggle profiles.
**Severity:** LOW
**Suggested Fix:** Add submission pattern indicators on the student detail page: submission frequency histogram, time-to-first-submission, time-between-submissions, and common error types.

### Finding 8.3: Status board stats are basic -- no distribution charts
**File:** `src/app/(public)/groups/[id]/assignments/[assignmentId]/status-board.tsx:295-322`
**TA Impact:** The status board shows mean, median, submitted count, and perfect score count. But there is no score distribution histogram, no problem-by-problem difficulty analysis, and no visualization of where students are struggling most. TAs cannot easily answer "Which problem is giving students the most trouble?"
**Severity:** MEDIUM
**Suggested Fix:** Add a "Problem Difficulty" chart showing per-problem statistics: solve rate, average attempts, most common error type, and score distribution.

---

## 9. Accessibility of TA Tools

### Finding 9.1: No keyboard shortcuts for rapid review
**File:** `src/hooks/use-keyboard-shortcuts.ts`
**TA Impact:** While the codebase has a `useKeyboardShortcuts` hook, it is only used for Vim-style scrolling (`src/components/layout/vim-scroll-shortcuts.tsx`). The submission review workflow, status board, and anti-cheat dashboard have no keyboard shortcuts. A TA reviewing submissions must click through each one with the mouse.
**Severity:** MEDIUM
**Suggested Fix:** Add keyboard shortcuts for common TA actions: j/k for next/prev submission, c to comment, r to rejudge, s to override score, n to mark as reviewed.

### Finding 9.2: Mobile experience for TA tools is likely poor
**File:** `src/app/(public)/groups/[id]/assignments/[assignmentId]/status-board.tsx`
**TA Impact:** The status board has a mobile card view (`MobileStudentCard`), but the anti-cheat dashboard, code timeline panel, and submission diff viewer are all designed for desktop-width screens. TAs trying to monitor exams from a tablet or phone will have a frustrating experience.
**Severity:** LOW
**Suggested Fix:** Audit all TA-facing components for mobile responsiveness, especially the anti-cheat dashboard and code timeline.

### Finding 9.3: No dark mode consideration for long grading sessions
**File:** `src/components/code/code-viewer.tsx`
**TA Impact:** While the app has a theme toggle, the code viewer uses a custom `--code-surface-background` variable. TAs grading for hours may experience eye strain. There is no "focus mode" or "grading mode" that minimizes distractions.
**Severity:** LOW
**Suggested Fix:** Add a "Grading Mode" toggle that maximizes the code viewer, hides navigation, and uses high-contrast syntax highlighting optimized for review.

---

## 10. Permission Model

### Finding 10.1: TA `submissions.view_source` is global, not scoped to assigned groups
**File:** `src/lib/capabilities/defaults.ts:22`
**Code:**
```ts
"submissions.view_source",
```
**TA Impact:** The `submissions.view_source` capability is granted globally to all assistants. This means any TA can view the source code of ANY submission they can access, not just submissions from their assigned groups. Combined with `problems.view_all`, a TA can view solutions to problems they shouldn't have access to.
**Severity:** HIGH
**Suggested Fix:** Scope `submissions.view_source` to groups where the user is explicitly assigned as an instructor/TA. The current group-scope filter in `canAccessSubmission` only checks `assignments.view_status`, not `submissions.view_source`.

### Finding 10.2: TAs can rejudge any submission in their groups with no approval
**File:** `src/lib/capabilities/defaults.ts:24`
**Code:**
```ts
"submissions.rejudge",
```
**TA Impact:** TAs have the `submissions.rejudge` capability, which allows them to trigger rejudging of any submission. Rejudging can change scores, affect leaderboards, and consume judge worker resources. There is no dual-approval or logging of WHO triggered a rejudge beyond the basic audit event. A malicious or careless TA could mass-rejudge submissions.
**Severity:** MEDIUM
**Suggested Fix:** Add a confirmation dialog with reason capture for rejudge actions, and restrict mass rejudge to instructors only.

### Finding 10.3: `canManageGroupResourcesAsync` treats co-instructor and TA identically
**File:** `src/lib/assignments/management.ts:72-86`
**Code:**
```ts
export async function canManageGroupResourcesAsync(...) {
  if (canManageGroupResources(groupInstructorId, userId)) return true;
  const caps = await resolveCapabilities(role);
  if (caps.has("groups.view_all")) return true;
  if (groupId) {
    const assignedRole = await getGroupInstructorAssignmentRole(groupId, userId);
    if (assignedRole === "co_instructor") return true;
  }
  return false;
}
```
**TA Impact:** The function only returns `true` for `co_instructor` but NOT for `ta`. However, `canManageGroupMembersAsync` (`line 93-113`) falls through to `isGroupTA` when the user has `groups.manage_members` capability. The net effect is that a TA with `groups.manage_members` can manage members, but a TA without it cannot even VIEW the instructor list. More critically, the `canManageGroupResourcesAsync` is used for assignment editing and score override management -- meaning TAs cannot edit assignments or manage score overrides unless they are co-instructors OR have global `groups.view_all`. This is inconsistent with the intended TA workflow.
**Severity:** HIGH
**Suggested Fix:** Create a clear permission matrix document and ensure `canManageGroupResourcesAsync` has a `ta` branch that grants appropriate limited permissions (view but not delete, comment but not override unless explicitly granted).

### Finding 10.4: Audit log is not accessible to TAs
**File:** `src/lib/capabilities/defaults.ts`
**TA Impact:** The `system.audit_logs` capability is in the `system` group, granted only to admin and super_admin. TAs have no access to audit logs, meaning they cannot see when scores were overridden, when anti-cheat events occurred, or when submissions were rejudged. This limits their ability to investigate student complaints.
**Severity:** MEDIUM
**Suggested Fix:** Create a scoped audit view for TAs showing only events related to their assigned groups and students.

---

## Summary Table

| # | Finding | Severity | Area |
|---|---------|----------|------|
| 1.1 | Submission detail page uses `capabilities=[]` for all non-owners | HIGH | Submission Review |
| 1.2 | No side-by-side code diff for submission review | MEDIUM | Submission Review |
| 1.3 | Code viewer lacks review-mode features | LOW | Submission Review |
| 1.4 | No bulk submission review workflow | HIGH | Submission Review |
| 2.1 | Comments are plain text only -- no formatting | HIGH | Feedback |
| 2.2 | Comments cannot be edited or deleted | HIGH | Feedback |
| 2.3 | No comment threading or replies | MEDIUM | Feedback |
| 2.4 | Line-numbered comments have poor UX | MEDIUM | Feedback |
| 2.5 | No rubric-based or structured feedback | HIGH | Feedback |
| 2.6 | Score override lacks visible audit trail | MEDIUM | Feedback |
| 3.1 | Clarifications lack urgency/priority | MEDIUM | Communication |
| 3.2 | No direct messaging | MEDIUM | Communication |
| 3.3 | Announcements not targetable | LOW | Communication |
| 4.1 | Anti-cheat has no real-time alerting | HIGH | Exam Monitoring |
| 4.2 | No live "who is active" view | HIGH | Exam Monitoring |
| 4.3 | Anti-cheat lacks geolocation context | MEDIUM | Exam Monitoring |
| 4.4 | No intervention from anti-cheat dashboard | MEDIUM | Exam Monitoring |
| 4.5 | Code timeline lacks diff between snapshots | MEDIUM | Exam Monitoring |
| 5.1 | Manual grading UI is missing despite schema support | CRITICAL | Grading |
| 5.2 | No grader confidence indicator | MEDIUM | Grading |
| 5.3 | No inter-rater reliability tracking | MEDIUM | Grading |
| 5.4 | Score override reason is optional | MEDIUM | Grading |
| 6.1 | No office hours queue | HIGH | Office Hours |
| 6.2 | No session notes | MEDIUM | Office Hours |
| 7.1 | No shared notes/escalation system | HIGH | Collaboration |
| 7.2 | No TA activity log for instructors | MEDIUM | Collaboration |
| 7.3 | TA role is binary, no per-group granularity | MEDIUM | Collaboration |
| 8.1 | No early warning for struggling students | HIGH | Analytics |
| 8.2 | No submission pattern analysis | LOW | Analytics |
| 8.3 | Status board lacks distribution charts | MEDIUM | Analytics |
| 9.1 | No keyboard shortcuts for TA workflow | MEDIUM | Accessibility |
| 9.2 | Mobile experience likely poor | LOW | Accessibility |
| 9.3 | No grading mode / focus mode | LOW | Accessibility |
| 10.1 | `view_source` is global, not group-scoped | HIGH | Permissions |
| 10.2 | TAs can rejudge without approval | MEDIUM | Permissions |
| 10.3 | co_instructor/TA permission distinction blurry | HIGH | Permissions |
| 10.4 | Audit logs inaccessible to TAs | MEDIUM | Permissions |

---

## Top 5 Priority Fixes (TA Impact Ranking)

1. **Build manual grading UI** (CRITICAL, Finding 5.1) -- The schema supports it but the UI is entirely missing. This is a broken promise in the data model.

2. **Fix capability injection on public submission detail** (HIGH, Finding 1.1) -- TAs visiting submission details through public routes get zero capabilities, breaking their core workflow.

3. **Add rich text / markdown to TA comments** (HIGH, Finding 2.1) -- Human TA comments render worse than AI comments. This discourages TAs from leaving detailed feedback.

4. **Add real-time anti-cheat alerting** (HIGH, Finding 4.1) -- Passive polling is insufficient for exam proctoring. TAs need immediate notification of suspicious activity.

5. **Add early warning / at-risk student detection** (HIGH, Finding 8.1) -- TAs need automated help identifying struggling students, not just raw data tables.
