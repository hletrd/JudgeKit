# Teaching Assistant (TA) Persona Review

**Reviewer**: TA for a CS course using JudgeKit
**Date**: 2026-04-20
**Role under review**: `assistant` (built-in role, level 1)

---

## 1. Grading Workflow

### What works

The admin submissions page at `/dashboard/admin/submissions` is solid for browsing. It provides:

- **Rich filtering**: status (9 values), group, language, date range (from/to), text search across student name and problem title
- **Column sorting**: by submitted date, score, status, language (clickable headers with direction indicators)
- **Pagination**: 50 per page with proper offset clamping
- **Auto-refresh**: `SubmissionListAutoRefresh` polls when active (pending/queued/judging) submissions exist
- **Scoped access**: assistants with `assignments.view_status` only see submissions from their assigned groups via `getSubmissionReviewGroupIds` -- this is correct and important

Source code reference: `src/app/(dashboard)/dashboard/admin/submissions/page.tsx` lines 72-84.

The submission detail view uses `CodeViewer` which dynamically imports `CodeSurface` (Monaco-based) with proper syntax highlighting for most languages, and falls back to a monospace textarea for raw-text languages. Copy button included.

Source: `src/components/code/code-viewer.tsx`.

### What is broken or missing

**No assignment-specific filter.** The admin submissions page has a "group" filter but no "assignment" filter. During finals week when a single group has 5 assignments, I need to manually scan or use text search to find submissions for a specific assignment. This is a daily pain point. The database query already joins `assignments` -- adding an assignment dropdown is a straightforward enhancement.

**No problem-specific filter.** I can filter by language but not by problem. When a student emails "my submission for problem X keeps failing," I have to search by problem title and hope the match is unique enough.

**No "my groups only" default.** The page loads all submissions I have access to. For a TA who assists with one section of 30 students, I should land on a pre-filtered view showing only my section's submissions, not the entire course's.

**No quick "who submitted for this problem" view.** I have to go to the contest/assignment status board to see per-student per-problem breakdowns. There is no way to see this from the submissions listing page directly.

---

## 2. Manual Review / Subjective Grading

### What works

**Comment system is well-designed.** The `CommentSection` component at `src/app/(dashboard)/dashboard/submissions/[id]/_components/comment-section.tsx` supports:

- Line-numbered comments (targeting specific code lines via `lineNumber` field)
- AI comments rendered with markdown (via `AssistantMarkdown`), human comments as plain text
- Visual distinction: AI comments get a blue "AI" badge; human comments show author name and role badge
- Proper audit logging when comments are added (`submission.comment_added` in audit events)

**Score overrides exist and are functional.** The `ScoreOverrideDialog` at `src/app/(dashboard)/dashboard/groups/[id]/assignments/[assignmentId]/score-override-dialog.tsx` provides:

- Per-problem per-student score override
- Required reason field
- Remove override option
- Visual indicator when a score has been overridden
- All wired to `/api/v1/groups/{id}/assignments/{id}/overrides` with POST/DELETE

The status board at `src/app/(dashboard)/dashboard/groups/[id]/assignments/[assignmentId]/page.tsx` integrates these overrides with `canManageOverrides` gating and clear labels.

### What is broken or missing

**Assistant role CANNOT comment on submissions.** This is the single most damaging permission gap in the entire system. Looking at `src/lib/capabilities/defaults.ts` lines 15-28:

```typescript
const ASSISTANT_CAPABILITIES: readonly Capability[] = [
  ...STUDENT_CAPABILITIES,
  "submissions.view_all",
  "submissions.view_source",
  "assignments.view_status",
  "problems.view_all",
  "anti_cheat.view_events",
  "files.upload",
];
```

The `submissions.comment` capability is assigned to `instructor` (line 52) but NOT to `assistant`. This means as a TA, I can view every submission, read every student's source code, see the test results -- but I cannot leave feedback. I have to separately tell the instructor what to write, or the instructor has to comment on my behalf. This completely defeats the purpose of having TAs.

**Assistant role CANNOT override scores.** The `canManageOverrides` check in the status board delegates to `canManageGroupResourcesAsync`. While the capability system does not have a dedicated "score override" capability, the current logic requires instructor-level group management access. A TA viewing the status board cannot click the pencil icon to adjust a score.

**No inline annotation UI.** While `lineNumber` is supported in the data model and comment form, there is no visible way in the `CodeViewer` to click on a line and start a comment. The `targetLine` prop and `onClearTargetLine` callback exist in `CommentSection` props but the `CodeViewer` component has no click handler wired to them. The line-number feature is data-model complete but UI-incomplete.

---

## 3. Student Monitoring During Exams

### What works

**Exam session tracking is solid.** The `src/lib/assignments/exam-sessions.ts` module handles:

- Windowed exam sessions with per-student personal deadlines
- Idempotent session creation (calling start twice returns same session)
- IP address recording on session start
- Countdown timers on both student and instructor views

**Anti-cheat dashboard is comprehensive.** The `AntiCheatDashboard` at `src/components/contest/anti-cheat-dashboard.tsx` provides:

- Event listing with type-colored badges (tab_switch, copy, paste, blur, contextmenu, ip_change, code_similarity)
- Review tier classification (context/signal/escalate) via `getAntiCheatReviewTier`
- Filter by event type and by student
- Code similarity check with flagged pairs table
- Expandable event details with JSON formatting
- Load-more pagination
- Summary stat cards (total events, unique students, top event type)

**Contest quick stats auto-refresh.** `ContestQuickStats` refreshes every 15 seconds, giving a live pulse of participant count, submission count, average score, and problems solved count.

**Participant audit view.** The `/dashboard/contests/{assignmentId}/participant/{userId}` route shows a timeline view with `CodeTimelinePanel` for tracking submission patterns per student during an exam.

### What is broken or missing

**Assistant cannot run similarity checks.** The `anti_cheat.run_similarity` capability is assigned to instructor but not assistant. I can view anti-cheat events but cannot trigger a similarity check myself. During an exam, if I notice suspicious patterns, I have to ask the instructor to run the check for me. This creates a delay that matters during a live exam.

**No "who hasn't started" indicator.** The status board shows who has submitted but there is no dedicated "not yet started exam session" filter or visual callout for windowed exams. I can filter by `not_submitted` status, but during an exam, "not yet clicked Start" is the critical metric, and it requires cross-referencing the exam sessions list with the participant list in my head.

**No real-time "who is active right now" view.** There is no heartbeat or presence indicator. I can see when a student last submitted, but not whether they currently have the exam page open. For a 90-minute exam with 200 students, "who went quiet 20 minutes ago" is a question I cannot answer.

**Assistant cannot view contest analytics.** The `contests.view_analytics` capability is instructor-only. The analytics tab (which contains `AnalyticsCharts`) is invisible to me. I cannot see submission time distributions or per-problem difficulty analysis during or after an exam.

**Assistant cannot export contest results.** The `contests.export` capability is instructor-only. If the professor asks me to prepare a grading spreadsheet, I cannot export it myself.

---

## 4. Communication

### What works

**Contest clarifications work well.** `ContestClarifications` at `src/components/contest/contest-clarifications.tsx` provides:

- Students can ask questions tagged to a specific problem or "general"
- Instructors/TAs can answer with custom text or quick responses (Yes / No / No Comment)
- Public/private toggle for answers
- Delete capability for managing clutter
- Auto-refresh every 30 seconds (visibility-aware)
- Answered/pending status badges

**Community discussions exist.** The `/community` page with thread creation, voting, and moderation is available. Admin discussions moderation page at `/dashboard/admin/discussions` with scope and state filtering.

### What is broken or missing

**Assistant cannot moderate community.** The `community.moderate` capability is instructor-only. If a student posts something inappropriate in the community forum, I cannot lock or delete it.

**No direct student-TA messaging.** There is no private messaging system. If a student has a question they do not want to post publicly, their only option is email. During exams, clarifications are public by default, which means students cannot privately report technical issues (e.g., "the judge is rejecting my code but it works on my machine").

**Clarification answers are visible to the TA only if the TA has `canManage`.** Looking at the contest detail page at `src/app/(dashboard)/dashboard/contests/[assignmentId]/page.tsx` line 665, `canManage` gates the answer form. The `canManage` check requires instructor-level group resource management via `canManageGroupResourcesAsync`. As an assistant, I can see the clarification questions but cannot answer them. During an exam, this means all clarification responses must come from the instructor.

**No announcement authoring for assistants.** `ContestAnnouncements` is shown on the overview tab, but creating announcements appears to be gated by `canManage`. As a TA running an exam session while the professor is in another room, I cannot post "10 minutes remaining" or "problem B test data corrected" announcements.

---

## 5. AI Auto-Review

### What works

The auto-review system at `src/lib/judge/auto-review.ts` is thoughtfully implemented:

- **Concurrency-limited** (2 concurrent via `pLimit`) to prevent API bursts
- **30-second timeout** with `AbortController` to prevent resource leaks
- **Per-problem opt-out** via `allowAiAssistant` flag on problems
- **Per-user language preference** (defaults to Korean, respects `preferredLanguage`)
- **Idempotent** -- checks for existing AI comment before generating another
- **Non-blocking** -- errors are caught and logged, never affect the judge pipeline
- **Well-structured prompt** -- asks for 3-8 bullet points, no test-result reiteration, targeted suggestions

AI comments are visually distinct from human comments (blue "AI" badge, markdown rendering), which is good for transparency.

### What is broken or missing

**Only runs on ACCEPTED submissions.** This is a significant design choice with real pedagogical consequences. A student who gets "Wrong Answer" on 8 out of 10 test cases receives zero AI feedback. The student who gets "Accepted" on a brute-force O(n^2) solution gets a review suggesting optimization. The student who most needs help gets nothing. For a teaching platform, auto-review should be configurable per-assignment to run on any terminal submission status, or at minimum on WA and RE.

**TA cannot manually trigger a review.** There is no "Generate AI Review" button on the submission detail page. If I want AI feedback on a student's wrong-answer submission, there is no way to get it. The `triggerAutoCodeReview` function is called only from the judge pipeline.

**TA cannot edit or delete AI comments.** The comment section does not show edit/delete buttons for any comments, including AI ones. If the AI produces a misleading or incorrect suggestion (which LLMs do), I cannot remove it. The student sees it as authoritative because it has the platform's "AI" badge.

**No per-assignment toggle for auto-review.** The `allowAiAssistant` flag is per-problem, not per-assignment. During an exam, I may want AI review disabled entirely, but I cannot toggle it off for the exam assignment without modifying each problem individually.

**Problem description truncated to 2000 characters.** Line 129: `problemDescription.slice(0, 2000)`. For complex problems with long descriptions, the AI is reviewing code against an incomplete problem statement. This can produce inaccurate feedback.

---

## 6. Batch Operations

### What works

**Bulk rejudge exists.** The `AdminSubmissionsBulkRejudge` component at `src/app/(dashboard)/dashboard/admin/submissions/admin-submissions-bulk-rejudge.tsx` allows rejudging all currently visible submissions on the page. It uses a confirmation dialog (via `DestructiveActionDialog`) and shows success/failure toast notifications.

**CSV export for admin submissions.** The `/api/v1/admin/submissions/export` route exports up to 10,000 rows with submission ID, user, group, problem, language, status, score, and timestamp. BOM-prefixed for Excel compatibility.

**Contest export is comprehensive.** The `/api/v1/contests/{assignmentId}/export` route supports both CSV and JSON formats, with anonymized mode. Includes per-problem scores, attempts, anti-cheat event counts, and IP addresses. Also capped at 10,000 entries.

### What is broken or missing

**Bulk rejudge only affects the current page.** The `submissionIds` prop comes from `visibleSubmissions.map((submission) => submission.id)` -- that is 50 IDs max. If I want to rejudge 500 submissions, I have to do it 10 pages at a time. There is no "rejudge all matching filter" option.

**No batch score override.** If I discover a test case was wrong and need to give everyone partial credit, I have to open the override dialog for each student individually. For 200 students, that is 200+ clicks.

**No batch commenting.** I cannot select multiple submissions and post "The test data for problem C was corrected, please resubmit" to all of them at once.

**Assistant cannot use contest export.** The `contests.export` capability is instructor-only. The export button is rendered on the contest detail page, but clicking it as an assistant would fail the capability check at the API level (the route handler checks capabilities).

**No grade report generation.** There is no built-in way to generate a final grade report that combines scores across multiple assignments in a group. I have to export each assignment separately and merge in a spreadsheet.

---

## 7. TA vs Instructor Permissions

This is where JudgeKit fails the TA persona most severely. The `assistant` role at `src/lib/capabilities/defaults.ts` lines 15-28 is a read-only viewer with submission upload. Here is the full comparison:

| Capability | Student | Assistant | Instructor | Gap Impact |
|---|---|---|---|---|
| `submissions.view_all` | - | YES | YES | - |
| `submissions.view_source` | - | YES | YES | - |
| `submissions.comment` | - | **NO** | YES | **CRITICAL**: Cannot leave feedback |
| `submissions.rejudge` | - | **NO** | YES | Cannot rejudge stuck submissions |
| `assignments.view_status` | - | YES | YES | - |
| `assignments.create/edit/delete` | - | **NO** | YES | Minor -- TAs rarely create assignments |
| `contests.view_analytics` | - | **NO** | YES | Cannot see submission patterns |
| `contests.view_leaderboard_full` | - | **NO** | YES | Cannot see full leaderboard |
| `contests.export` | - | **NO** | YES | Cannot export results |
| `contests.manage_access_codes` | - | **NO** | YES | Cannot manage exam access |
| `community.moderate` | - | **NO** | YES | Cannot moderate forums |
| `anti_cheat.view_events` | - | YES | YES | - |
| `anti_cheat.run_similarity` | - | **NO** | YES | Cannot run similarity checks |
| `problems.create/edit` | - | **NO** | YES | Acceptable for TAs |

**The assistant role is effectively a read-only observer, not a grader.** The name "assistant" implies someone who assists with grading, but the capability set describes someone who can only look. In practice, this means the instructor either:

1. Promotes TAs to `instructor` role (over-permissioning -- they can now delete assignments, manage groups, create problems)
2. Does all commenting, overriding, and contest management themselves (defeating the purpose of TAs)
3. Creates a custom role with the right capabilities (possible via the role system but not obvious)

The capability system supports custom roles (`src/lib/capabilities/types.ts` line 191 shows `RoleRecord` with `isBuiltin: boolean`), so the infrastructure exists. But the default `assistant` role is so under-powered that every TA setup requires manual role configuration, which most instructors will not know how to do.

---

## 8. Pain Points and Missing Features

### Daily friction

1. **Cannot comment on student code.** This is the number one complaint. I can see the code, I can see the bug, but I cannot tell the student about it through the platform. I have to use external email or Slack.

2. **No assignment filter on submissions page.** During grading season, I spend more time searching for the right submissions than actually reviewing them.

3. **Score overrides are one-at-a-time.** When a test case is wrong and 50 students are affected, I need 50 individual override operations.

4. **Cannot answer exam clarifications.** During a live exam, the professor may be away and I am the point of contact. But I cannot respond to student questions in the system.

### Missing features that would help

5. **"Students who haven't submitted" dashboard.** A simple view showing, for a given assignment, which enrolled students have zero submissions. Currently I have to mentally compare the status board (which shows students WITH submissions) against the enrollment roster.

6. **AI review on non-accepted submissions.** Students who fail need the most help. The AI should be configurable to review WA, RE, and TLE submissions too.

7. **Inline code commenting.** The `lineNumber` field exists in the data model, but there is no UI to click a line in `CodeViewer` and start a comment. This is the most natural way to give code feedback and it is half-implemented.

8. **Submission diff view.** When a student submits 15 times, I cannot see what changed between attempt 4 and attempt 12. I have to open each submission in a separate tab and compare mentally.

9. **Grading rubric / checklist.** There is no structured rubric system for subjective grading. Comments are freeform text only. A checklist ("Uses correct algorithm: Y/N", "Handles edge cases: Y/N", "Code style: 1-5") would make grading faster and more consistent.

10. **Notification system.** When a student submits a regrade request or asks a clarification question, I get no notification. I have to periodically check the relevant pages.

---

## Summary Verdict

JudgeKit's grading and monitoring infrastructure is well-engineered at the data and API level. The status board, anti-cheat dashboard, exam session tracking, export system, and AI auto-review all work correctly. The permission system is granular and properly enforced.

The fundamental problem is that the `assistant` role was designed as a read-only observer, not as an active grader. A TA who can view submissions but cannot comment, cannot override scores, cannot answer clarifications, cannot run similarity checks, and cannot export results is not actually "assisting" -- they are spectating. The platform forces a choice between over-permissioning (promote to instructor) or under-permissioning (keep as assistant), with no middle ground in the default role.

The second-order problem is UI completeness: line-numbered commenting is data-model complete but UI-incomplete, assignment filtering is absent from the submissions page, and batch operations are limited to rejudging the current page view.

**If I were choosing whether to use JudgeKit as a TA**, I would say: the infrastructure is there, the monitoring is good, and the exam integrity tools are excellent. But I would need the instructor to either promote me to instructor role (which I should not need) or create a custom TA role with `submissions.comment`, `contests.view_analytics`, `contests.export`, and `anti_cheat.run_similarity` at minimum. Without those, my daily workflow is significantly impaired.

---

*Key source files examined:*
- `src/lib/capabilities/defaults.ts` -- role capability definitions
- `src/lib/capabilities/types.ts` -- all capability definitions
- `src/app/(dashboard)/dashboard/admin/submissions/page.tsx` -- admin submission listing
- `src/app/(dashboard)/dashboard/submissions/[id]/submission-detail-client.tsx` -- submission detail view
- `src/app/(dashboard)/dashboard/submissions/[id]/_components/comment-section.tsx` -- commenting UI
- `src/lib/judge/auto-review.ts` -- AI auto-review implementation
- `src/components/contest/contest-clarifications.tsx` -- exam clarification system
- `src/components/contest/anti-cheat-dashboard.tsx` -- anti-cheat monitoring
- `src/app/(dashboard)/dashboard/contests/[assignmentId]/page.tsx` -- contest detail / exam monitor
- `src/lib/assignments/exam-sessions.ts` -- exam session management
- `src/app/(dashboard)/dashboard/groups/[id]/assignments/[assignmentId]/score-override-dialog.tsx` -- score override UI
- `src/app/api/v1/contests/[assignmentId]/export/route.ts` -- contest export
- `src/app/api/v1/admin/submissions/export/route.ts` -- admin submission export
- `src/lib/assignments/submissions.ts` -- assignment status / scoring logic
- `src/lib/auth/permissions.ts` -- submission access control
