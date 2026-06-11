# Teaching Assistant Perspective Review

**Reviewer role:** Teaching Assistant (TA)
**Date:** 2026-04-17 (Post-Plan-008)
**Scope:** Permission boundaries, grading workflow, submission review, discussion moderation, anti-cheat access

---

## 1. Role Definition — 6/10

**What works well:**

The `assistant` built-in role now exists in the capability system (`src/lib/capabilities/defaults.ts`). It sits at level 1 (between student at 0 and instructor at 2) and has view-only capabilities:
- `submissions.view_all` — can see all submissions
- `submissions.view_source` — can see submission source code
- `assignments.view_status` — can see assignment progress
- `users.view` — can see user profiles
- `problems.view_all` — can see all problems including hidden ones
- `anti_cheat.view_events` — can see anti-cheat event logs
- `files.upload` — can upload files

**What's broken:**

- **Assistants cannot rejudge submissions.** `submissions.rejudge` is instructor-only. If a TA notices a judge error, they must escalate to an instructor — they cannot fix it themselves.
- **Assistants cannot comment on submissions.** `submissions.comment` is instructor-only. TAs who want to leave feedback are blocked.
- **Assistants cannot create or edit problems.** `problems.create` and `problems.edit` are instructor-only. TAs who author practice problems are blocked.
- **Assistants cannot create or edit assignments.** `assignments.create` and `assignments.edit` are instructor-only. TAs who help set up assignments are blocked.
- **Assistants cannot run similarity checks.** `anti_cheat.run_similarity` is instructor-only. TAs can view events but cannot proactively investigate suspected plagiarism.
- **Assistants cannot manage group members.** `groups.manage_members` is instructor-only. TAs cannot add or remove students from their own sections.

The assistant role is essentially a read-only observer. For actual TA duties (grading, feedback, problem authoring, plagiarism investigation), it's nearly useless out of the box.

---

## 2. Group-Level TA Permissions — 4/10

**What's broken:**

The `group_instructors` table has `ta` and `co_instructor` role entries, but these are largely ignored by permission checks. When a TA is added to a specific group via `GroupInstructorsManager`, they get one of two outcomes:

1. **If their system role is "student"**: They see almost nothing. The `canAccessGroup` check passes (because they're in `group_instructors`), but capability checks block them from viewing submissions, seeing problems, etc.
2. **If their system role is "instructor"**: They get full instructor capabilities system-wide, not just for their assigned group. A TA for CS101 now has instructor access to CS201, CS301, and every other course.

There is no middle ground. The `group_instructors.role` field (`ta` vs `co_instructor`) is stored but not used by most permission checks. A TA should have elevated permissions within their assigned groups only, but the system doesn't support this.

**Concrete example:**
- TA "Alice" is assigned as `ta` to group "CS101-Fall2025"
- Alice's system role is "assistant" (the closest match)
- Alice can view all submissions system-wide (via `submissions.view_all` capability)
- Alice cannot rejudge, comment, or create problems in CS101 or anywhere
- If Alice is given "instructor" role instead, she gets full instructor access to ALL groups, not just CS101

---

## 3. Submission Review Workflow — 5/10

**What works well:**

Assistants can view all submissions and source code. The diff view for failing test cases (`OutputDiffView`) helps TAs understand what went wrong. Submission detail page shows test case results, judge output, and execution details.

**What's broken:**

- **No way to leave feedback.** TAs cannot comment on submissions. If they notice a student's approach is close but has a subtle bug, they have no in-platform way to communicate this.
- **No way to rejudge.** If a TA suspects a judge error, they must escalate. No self-service.
- **No score override access.** The `ScoreOverrideDialog` is only available to instructors. TAs cannot adjust scores even for obvious judge errors.
- **No filtered view for "my groups."** The admin submissions page shows all submissions system-wide. A TA responsible for CS101 must manually filter to their group's submissions with no saved filter.
- **Anti-cheat is contest-only.** The `AntiCheatDashboard` is embedded exclusively in the contest detail page. For non-contest assignments where TAs typically help with plagiarism detection, there is no anti-cheat visibility.

---

## 4. Problem and Assignment Assistance — 3/10

**What works well:**

Assistants can view all problems including hidden ones and see assignment status.

**What's broken:**

- **Cannot create problems.** TAs who author practice problems for their sections are blocked.
- **Cannot edit problems.** TAs who spot a typo or clarify a problem statement cannot fix it.
- **Cannot create assignments.** TAs who help set up lab assignments are blocked.
- **Cannot edit assignments.** TAs who need to adjust deadlines for their section are blocked.
- **Cannot manage test cases.** Even adding a missing test case requires instructor escalation.

In practice, most TAs at universities handle problem authoring and assignment setup for their sections. The current capability model assumes TAs are passive observers, which doesn't match real-world TA workflows.

---

## 5. Communication and Moderation — 5/10

**What works well:**

Assistants have `community.moderate` capability (inherited from instructor capabilities — wait, no, they don't). Actually checking `defaults.ts`: assistants do NOT have `community.moderate`. They only have view-only capabilities.

**What's broken:**

- **No community moderation.** TAs cannot moderate discussion posts, even in their own course's discussion forum.
- **No student communication tools.** No way to message students, post announcements, or provide feedback on submissions.
- **No discussion visibility.** It's unclear if TAs can even see discussion threads for their groups, since there's no `community.view` capability.

---

## 6. Anti-Cheat Access — 5/10

**What works well:**

Assistants can view anti-cheat events (`anti_cheat.view_events`). They can see tab switches, copy/paste events, and heartbeat gaps for contest participants.

**What's broken:**

- **Cannot run similarity checks.** `anti_cheat.run_similarity` is instructor-only. TAs who suspect plagiarism must escalate.
- **Anti-cheat dashboard is contest-only.** For regular assignments where plagiarism is most common, there is no anti-cheat visibility.
- **No anti-cheat for non-contest work.** The monitoring only activates for exam-mode assignments. Regular homework submissions are unmonitored.

---

## Summary Scorecard

| Area | Score | Key Issue |
|---|---|---|
| Role Definition | 6/10 | Too restrictive — read-only observer |
| Group-Level Permissions | 4/10 | group_instructors.role is ignored |
| Submission Review | 5/10 | No feedback, no rejudge, no score override |
| Problem/Assignment Help | 3/10 | Cannot create, edit, or manage anything |
| Communication | 5/10 | No moderation, no messaging tools |
| Anti-Cheat Access | 5/10 | View-only, contest-only, no similarity checks |
| **Overall** | **6.5/10** | Role exists but doesn't match real TA workflows |

---

## Recommended Capability Additions for TA Role

The assistant role needs these capabilities to be functional for real TA duties:

1. `submissions.rejudge` — TAs need to fix judge errors
2. `submissions.comment` — TAs need to provide feedback
3. `problems.create` — TAs author practice problems
4. `problems.edit` — TAs fix typos and clarify statements
5. `anti_cheat.run_similarity` — TAs investigate plagiarism
6. `groups.manage_members` — TAs manage their section enrollment

Additionally, the permission system needs to respect `group_instructors.role` so that TAs get elevated permissions only within their assigned groups, not system-wide.
