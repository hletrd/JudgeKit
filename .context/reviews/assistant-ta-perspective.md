# TA / Assistant Perspective Review

**Reviewer role**: Teaching Assistant (TA)
**Date**: 2026-05-04
**Scope**: Full TA workflow -- submission review, grading, exam monitoring, discussion moderation, group management, navigation, permission boundaries

---

## Executive Summary

The TA role in JudgeKit has solid permission-scoping fundamentals -- submissions are correctly scoped to assigned teaching groups, and the capability system cleanly separates TA from instructor powers. However, the TA experience has a critical navigation gap: a default TA with no admin-level capabilities gets **no sidebar at all** and must navigate through the public header dropdown, which lacks TA-specific items. Combined with the inability to manage score overrides (locked behind co-instructor status) and the absence of discussion moderation rights, a TA trying to grade 200 submissions in an evening will fight the UI more than the actual grading work.

---

## Critical Issues

### C1. No sidebar for default TAs -- navigation is broken

**Severity**: Critical
**Files**: `src/components/layout/app-sidebar.tsx:155-163`, `src/lib/navigation/public-nav.ts`

The sidebar (`AppSidebar`) checks `hasAdminCapabilities` and returns `null` if the user has none of: `system.settings`, `users.view`, `users.manage_roles`, `system.audit_logs`, `system.login_logs`, `system.chat_logs`, `system.plugins`, `files.manage`. A default TA has **none** of these capabilities (see `defaults.ts:15-34`). The sidebar disappears entirely.

The TA is then left with the PublicHeader dropdown, which only shows: Dashboard, Problems, Groups, My Submissions, Contests, Profile. There is no "Submissions to Review" link, no "Anti-Cheat" link, no TA-specific quick actions.

The `InstructorDashboard` component (which TAs do see, since they have `assignments.view_status`) provides quick action buttons for Groups, Contests, and Submissions -- but the Submissions button links to `/dashboard/admin/submissions`, which requires `submissions.view_all` or `assignments.view_status`. The TA has `assignments.view_status` so they can access it, but the page title says "All Submissions" which is misleading for a scoped view.

**Impact**: A TA must know the exact URLs to navigate to their work. There is no discoverable path from the dashboard to "review submissions for my groups."

### C2. TAs cannot manage score overrides

**Severity**: Critical
**Files**: `src/app/api/v1/groups/[id]/assignments/[assignmentId]/overrides/route.ts:31-64`, `src/lib/assignments/management.ts:72-86`

Score overrides use `canManageGroupResourcesAsync()`, which grants access to: (1) the group owner, (2) users with `groups.view_all` capability, or (3) users with `co_instructor` role in the group. TAs (role `"ta"` in `groupInstructors`) are explicitly excluded from case 3.

This means a TA who is reviewing submissions and providing feedback **cannot adjust scores**. The ScoreOverrideDialog is only rendered when `canManageOverrides` is true (passed as `canManage` from the contest/group pages). For a TA, this is always false.

**Impact**: A TA reviewing 200 submissions must ask the instructor to manually override every score that needs adjustment. This defeats the purpose of having TAs.

### C3. No bulk operations for TA-scoped submissions

**Severity**: Critical
**Files**: `src/app/(dashboard)/dashboard/admin/submissions/page.tsx`, `src/app/(dashboard)/dashboard/admin/submissions/admin-submissions-bulk-rejudge.tsx`

The bulk rejudge feature on the admin submissions page (`AdminSubmissionsBulkRejudge`) only operates on the currently visible submissions. While TAs can access this page (they have `assignments.view_status`), there is no way to bulk rejudge **all submissions for a specific problem** within their scoped groups. The TA must individually rejudge each submission via the submission detail page.

**Impact**: When a problem's test cases are updated and all submissions need rejudging, a TA with 200 submissions must click rejudge 200 times individually.

### C4. TAs cannot moderate discussions

**Severity**: High
**Files**: `src/lib/capabilities/defaults.ts:15-34`, `src/lib/discussions/permissions.ts`

The `community.moderate` capability is only granted to instructors and admins. TAs do not have it. This means TAs cannot lock, pin, or delete inappropriate discussion threads.

In a course with 100+ students, discussions can get noisy. If a student posts exam answers or inappropriate content, the TA -- who is often the first responder -- cannot act. They must escalate to the instructor every time.

**Impact**: Delayed moderation response. Instructor becomes a bottleneck for routine moderation tasks.

---

## Minor Issues

### M1. Anti-cheat dashboard lacks actionable workflow

**Files**: `src/components/contest/anti-cheat-dashboard.tsx`

The anti-cheat dashboard shows events with review tiers (context/signal/escalate) and similarity pairs, but there is no way to:
- Flag a student for follow-up
- Add notes to a specific student's anti-cheat profile
- Mark an event as "reviewed" or "dismissed"
- Export anti-cheat data for a specific student

The TA can only view and filter. For a real exam with 100 students, the TA must maintain a separate spreadsheet to track which suspicious events they have already reviewed.

### M2. Submission detail page lacks inline code commenting

**Files**: `src/components/submissions/_components/comment-section.tsx`, `src/components/submissions/submission-detail-client.tsx`

The comment system supports `lineNumber` targeting (comments can reference a specific line), and the `CodeViewer` is rendered separately from the comment section. However, there is no way to click a line number in the code viewer to add a comment at that line. The TA must manually type the line number or use the `targetLine` prop, which is never set in the current submission detail page.

The `targetLine` prop on `CommentSection` defaults to `null` and `onClearTargetLine` is never wired up in `SubmissionDetailClient`. The infrastructure exists but is not connected.

**Impact**: TAs commenting on code must manually note line numbers. For a 200-line submission, this is error-prone and slow.

### M3. No TA-specific dashboard view

**Files**: `src/app/(dashboard)/dashboard/page.tsx:83-98`

TAs see the `InstructorDashboard` because they have `assignments.view_status`. This dashboard shows groups, active assignments, queued submissions, and recent activity -- all scoped to their teaching groups via `getAssignedTeachingGroupIds()`. This is reasonable, but:
- The "Queued Submissions" count includes all statuses (pending, queued, judging), not just items needing TA attention
- There is no "submissions needing review" or "submissions with low scores" summary
- There is no count of ungraded submissions or submissions needing feedback

### M4. Group page hides assignment management from TAs

**Files**: `src/app/(dashboard)/dashboard/groups/[id]/page.tsx:271,287`

The group detail page conditionally renders `GroupInstructorsManager` and `AssignmentFormDialog` only when `canManageGroup` is true. TAs cannot see the list of co-instructors/TAs assigned to the group, nor can they see the assignment creation form. This is correct for permissions, but TAs also cannot see **who else is assigned to help with the group** -- useful for coordination.

### M5. Contest page tabs partially hidden from TAs

**Files**: `src/app/(dashboard)/dashboard/contests/[assignmentId]/page.tsx:398-403`

The "Candidates" and "Invitations" tabs are gated behind `canManage`, which TAs do not have. This is correct. However, the "Anti-Cheat" tab is only shown when `assignment.enableAntiCheat` is true AND the user has access -- TAs have `anti_cheat.view_events` but the tab visibility depends on the assignment flag, not the capability. If anti-cheat is disabled on the assignment, the TA cannot see the tab even if they have the capability. This is correct behavior but worth noting.

### M6. Submission source code visibility depends on `canViewSource` prop

**Files**: `src/components/submissions/submission-detail-client.tsx:73`, `src/app/(public)/submissions/[id]/page.tsx:189`

When viewing a submission from the public route (`/submissions/[id]`), `canViewSource` is set to `isOwner`. A TA viewing a student's submission via this route would see an empty source code area. The TA must navigate through the admin submissions page or the assignment status board to view submission source code with proper capabilities. This is a discoverability issue.

---

## Suggestions for Improvement

### S1. Add TA-aware sidebar items

Add a new sidebar section for TAs that appears when the user has `assignments.view_status` but not admin capabilities. Items:
- "My Groups" (`/dashboard/groups`)
- "Review Submissions" (`/dashboard/admin/submissions` -- already works for TAs)
- "Contests" (`/dashboard/contests`)

This requires adding `assignments.view_status` as a capability check in `AppSidebar`'s `hasAdminCapabilities` logic, or creating a separate TA nav group.

### S2. Grant `groups.manage_members` to TAs by default

The TA role comment in `defaults.ts` says TAs can "view submissions, add comments" but the codebase infrastructure at `management.ts:93-113` already supports TAs managing members when they have `groups.manage_members`. Granting this capability would let TAs help with enrollment -- a common TA task.

### S3. Grant `community.moderate` to TAs

TAs are the front line for student interactions. Giving them moderation powers (lock, pin, delete threads) reduces instructor burden. The moderation controls at `discussion-thread-moderation-controls.tsx` are already built and capability-gated.

### S4. Allow TAs to manage score overrides

Change `canManageGroupResourcesAsync` to also check for TA role in the group, or add a separate `canManageScoreOverrides` check that includes TAs. The audit trail already records who made the override, so accountability is maintained.

### S5. Wire up inline code commenting

Connect the `CodeViewer`'s line click events to the `CommentSection`'s `targetLine` prop. The infrastructure exists:
- `CommentSection` accepts `targetLine` and `onClearTargetLine`
- `CodeViewer` uses `CodeSurface` which likely supports line click events

This would dramatically speed up code review workflows.

### S6. Add "needs attention" filters to the submission list

Add filters for: "submissions with score < 50%", "submissions with no TA comments", "submissions submitted in last 24 hours". These would help TAs prioritize their review queue.

### S7. Add bulk rejudge for scoped submissions

Allow TAs to bulk rejudge all submissions for a specific problem within their assigned groups. This could be a button on the assignment status board that triggers rejudging for all submissions to a specific problem.

---

## Permission Boundary Assessment

The permission boundaries are **well-designed** in theory:

| Action | TA | Instructor | Notes |
|--------|-----|-----------|-------|
| View submissions (scoped) | Yes | Yes | TAs scoped to assigned groups |
| View all submissions | No | Yes | Correct |
| Rejudge submissions | Yes | Yes | Both have `submissions.rejudge` |
| Comment on submissions | Yes | Yes | Both have `submissions.comment` |
| View anti-cheat events | Yes | Yes | Both have `anti_cheat.view_events` |
| Run similarity check | Yes | Yes | Both have `anti_cheat.run_similarity` |
| Create/edit assignments | No | Yes | Correct |
| Manage group members | No | Yes | Should be Yes for TAs |
| Score overrides | No | Yes | Should be Yes for TAs |
| Moderate discussions | No | Yes | Should be Yes for TAs |
| Create problems | No | Yes | Correct |
| View all problems | Yes | Yes | Both have `problems.view_all` |
| Manage roles | No | No | Admin only, correct |

The boundaries are mostly correct, but three capabilities should be added to the TA default set: `groups.manage_members`, `community.moderate`, and score override access.

---

## Overall Grade: C+

**Strengths**:
- Capability-based permission system is clean and extensible
- Submission scoping to teaching groups works correctly
- Anti-cheat monitoring is available to TAs with good filtering
- Bulk enrollment (paste list) is a great feature for instructors
- Score override dialog has good UX with reason field and audit trail
- Code viewer has copy button and syntax highlighting
- Comment system supports line-number references (infrastructure exists)

**Weaknesses**:
- Navigation is broken for default TAs (no sidebar, no TA-specific dropdown items)
- Score overrides locked out for TAs despite being a core grading task
- No bulk operations for TA-scoped submissions
- Discussion moderation unavailable to TAs
- Inline code commenting infrastructure exists but is not wired up
- No "needs attention" or prioritization features for high-volume grading

The platform has the right building blocks for a good TA experience, but the current implementation leaves TAs in a navigation desert with several key workflows blocked. A TA grading 200 submissions would need to: (1) manually navigate to `/dashboard/admin/submissions`, (2) filter by group, (3) open each submission individually, (4) add comments without inline line targeting, (5) ask the instructor to override any scores that need adjustment. This is a 3-star experience at best.