# TA / Assistant Review — JudgeKit — 2026-05-03

## Verdict — usable as TA on a real course?

**No — not yet.** The `assistant` built-in role exists and is wired into the capability system, but it remains a read-only observer role that cannot do the core job of a TA: leave feedback on submissions, comment on code, run plagiarism checks, or override an incorrect autograder verdict. The group-scoped TA role (`group_instructors.role = 'ta'`) is partially wired but the capability gap means an assistant-role user cannot act even within their assigned groups. The historical regression identified in the April 2026 review (role column stored but not used) has been **partially addressed** — `co_instructor` now gets `canManageGroupResourcesAsync` — but the `ta` sub-role still yields no elevated capabilities for the core grading actions. For a course running this week, a TA would need to be promoted to full `instructor` (granting them system-wide access across all groups) just to leave a comment. That is not acceptable.

---

## What Works

**Capability-system scaffolding is solid.**
`src/lib/capabilities/types.ts` defines 43 granular capabilities with sane groupings. The cache (`src/lib/capabilities/cache.ts`) loads from DB with a 60-second TTL and falls back to compiled defaults, so capability changes survive deploys without a restart. `ensureBuiltinRoles.ts` seeds or upserts all five built-in roles on startup via `onConflictDoUpdate`, preventing stale DB state.

**assistant role has correct view-only baseline.**
`src/lib/capabilities/defaults.ts:15-28` gives assistants: `submissions.view_all`, `submissions.view_source`, `assignments.view_status`, `problems.view_all`, `anti_cheat.view_events`, `files.upload`, plus the student baseline. An assistant can reach `/dashboard/admin/submissions` (the page checks `submissions.view_all` at line 81 of `admin/submissions/page.tsx`) and see all submissions across all groups. The scoped filter via `getSubmissionReviewGroupIds` (`submissions.ts:165-179`) correctly narrows the view to assigned groups when the role has `assignments.view_status` but not `submissions.view_all` — however, since `assistant` has `submissions.view_all`, this path is bypassed and TAs see all submissions site-wide.

**group_instructors table is well-structured.**
`schema.pg.ts:226-248`: `group_instructors(id, group_id, user_id, role, assigned_at)` with `unique(group_id, user_id)` and both indexed. The UI (`group-instructors-manager.tsx`) allows assigning `ta` or `co_instructor` roles per group. The API (`/api/v1/groups/[id]/instructors/route.ts`) correctly checks `canManageGroupResourcesAsync` before any mutation.

**co_instructor promotion is now enforced.**
`management.ts:72-86`: `canManageGroupResourcesAsync` explicitly returns `true` for `co_instructor` group role. This means a co_instructor added to Group X can create/edit assignments and override scores within Group X — the previous regression of ignoring `group_instructors.role` is **fixed for co_instructor**.

**Email gating in group API.**
`/api/v1/groups/[id]/route.ts:71-99`: `canViewEmails` is gated on `canManageGroupResourcesAsync`. Assistants who are not group owners or co_instructors receive `email: null` for both the instructor and enrolled students. This is correct behavior — a plain assistant cannot harvest a class roster of emails via the groups API.

**Submissions queue has group-scoping logic.**
`admin/submissions/page.tsx:113-120` + `submissions.ts:165-179`: when `submissions.view_all` is absent but `assignments.view_status` is present, the page restricts to `submissionReviewGroupIds` (groups where the user is owner or any `group_instructors` entry). The filter is applied to the SQL WHERE clause, not just the UI. This is correct, though assistants' `submissions.view_all` means they bypass it entirely (see bugs).

**Audit trail on grading actions.**
`rejudge/route.ts:85-103` and `comments/route.ts:76-89` both call `recordAuditEvent` with actor ID, role, resource type, and a human-readable summary. Score overrides (`overrides/route.ts:122-138`) are similarly logged. Anyone with the action capability leaves a traceable record.

---

## What's Broken

### BUG-1 — CRITICAL: assistant has `submissions.view_all`, bypassing group scope
**Severity: HIGH**

`defaults.ts:20`: `ASSISTANT_CAPABILITIES` includes `submissions.view_all`. The admin submissions page (`admin/submissions/page.tsx:81,113`) grants unrestricted submission visibility when this cap is set — `getSubmissionReviewGroupIds` returns `null` (meaning all) at `submissions.ts:170`. An assistant for Group CS101 can see every submission in every group on the platform.

A TA should have group-scoped submission access, not system-wide. Fix: remove `submissions.view_all` from `ASSISTANT_CAPABILITIES` and add `assignments.view_status` instead (already present at line 24 of defaults). The scoped path in `getSubmissionReviewGroupIds` already handles `assignments.view_status` correctly at `submissions.ts:174-178`, filtering to `getAssignedTeachingGroupIds(userId)`.

**Concrete fix** (`defaults.ts:15-28`):
```
// Remove: "submissions.view_all",
// Keep:   "submissions.view_source",  ← source access scoped by canAccessSubmission
// Keep:   "assignments.view_status",
```
Ensure `canAccessSubmission` in `permissions.ts:213-241` also gates source access via `canViewAssignmentSubmissions`, which uses `hasGroupInstructorRole` — it already does.

---

### BUG-2 — HIGH: `ta` group role confers zero actionable permissions
**Severity: HIGH**

`management.ts:82-85`: `canManageGroupResourcesAsync` only returns `true` for `co_instructor`, not `ta`. So a user assigned as `ta` to a group gets `canManage = false` everywhere: cannot create assignments, cannot edit assignments, cannot add members, cannot see the instructor management panel, cannot set score overrides, and — critically — cannot call the comment or rejudge APIs which independently check `submissions.comment` and `submissions.rejudge` capabilities.

The `isGroupTA` / `canManageGroupMembersAsync` helpers at `management.ts:93-122` exist and correctly distinguish `ta` from `co_instructor`, but they are only used for member-management gating. No other permission check ever calls `isGroupTA` to grant any elevated action capability.

The result: `ta` in `group_instructors` is a cosmetic label. It affects nothing beyond display in the UI badge.

**Fix**: define a specific capability elevation path for group TAs. When a user is a `ta` in a group, they should gain `submissions.comment` and `submissions.rejudge` (or a new `submissions.grade`) scoped to that group. The cleanest approach is adding a group-context check in the comment and rejudge route handlers, analogous to how `canViewAssignmentSubmissions` checks `hasGroupInstructorRole`.

---

### BUG-3 — HIGH: no `submissions.comment` or `submissions.rejudge` for assistant role
**Severity: HIGH**

`rejudge/route.ts:13`: `auth: { capabilities: ["submissions.rejudge"] }` — assistant does not have this.
`comments/route.ts:45`: `auth: { capabilities: ["submissions.comment"] }` — assistant does not have this.

These two API routes are the only mechanisms for leaving feedback or correcting autograder errors. A TA who spots a wrong answer verdict on a correct submission must file an email to the instructor. There is no in-platform escalation path.

`defaults.ts` assistant section is missing both capabilities. The April 2026 review flagged this; it has not been fixed.

---

### BUG-4 — HIGH: score override blocked for all TAs
**Severity: HIGH**

`overrides/route.ts:47-53`: `authorizeAssignmentAccess` calls `canManageGroupResourcesAsync` and returns `forbidden()` for plain assistants and group TAs. `ScoreOverrideDialog` is gated on `canManageOverrides` (contest `page.tsx:462`) which is also `canManage`. Neither an assistant nor a `ta` group member can touch score overrides.

For a course with manually graded problems (essays, open-ended questions, partial-credit coding), this makes TAs entirely useless for grading.

---

### BUG-5 — MEDIUM: `anti_cheat.run_similarity` missing from assistant; similarity route skips capability check entirely
**Severity: MEDIUM (two aspects)**

Aspect A: `defaults.ts:26`: assistants have `anti_cheat.view_events` but not `anti_cheat.run_similarity`. A TA who suspects plagiarism cannot trigger a similarity scan.

Aspect B (more severe): `similarity-check/route.ts:10-24` — the POST handler does **not** check `anti_cheat.run_similarity` at all. It only calls `canManageContest`, which resolves to `canManageGroupResourcesAsync`. An instructor who owns the group can run it; so can a co_instructor. But the dedicated capability `anti_cheat.run_similarity` is never consulted. If an admin grants a custom role that capability without making them a group owner or co_instructor, they still cannot run it. Conversely, any co_instructor can run similarity even if their role doesn't have `anti_cheat.run_similarity`. The capability exists in the schema but is enforced nowhere.

---

### BUG-6 — MEDIUM: anti-cheat dashboard is contest-only; no non-contest assignment coverage
**Severity: MEDIUM**

`contests/[assignmentId]/page.tsx:522-535`: the anti-cheat tab only renders inside contest detail pages (where `exam_mode != 'none'`). Regular assignments (lab submissions, homework) do not surface anti-cheat events anywhere in the UI. `anti_cheat.view_events` is in the assistant capability set but there is no UI entry point outside the contest view for a TA to see tab-switch or copy-paste events for a homework assignment.

---

### BUG-7 — MEDIUM: `users.view` capability grants assistants email access via `/api/v1/users/[id]`
**Severity: MEDIUM**

`src/lib/db/selects.ts:24`: `safeUserSelect` includes `email: users.email`. `users/[id]/route.ts:274-283`: the GET handler returns the full `safeUserSelect` result to any caller with `users.view` or who is accessing their own profile. `assistant` does not have `users.view` in `defaults.ts`, so the default assistant role is protected here.

However, the admin users list page (`admin/users/page.tsx:55`) requires `users.view` to enter. Since `assistant` does not have this capability they cannot reach that page. This is correct — but it means the question of whether `users.view` should exist as a TA-level capability needs to stay explicitly denied. If an admin ever manually adds `users.view` to a custom TA role without reviewing what `safeUserSelect` returns, they will leak every user's email address. The capability name ("view users") doesn't communicate that it includes PII.

**Recommendation**: rename to `users.view_pii` or strip email from the response when the caller lacks an explicit `users.view_email` capability.

---

### BUG-8 — LOW: no grading queue, no collision prevention, no "claimed by" locking
**Severity: LOW (missing feature)**

There is no grading queue. Multiple TAs can open the same submission simultaneously and submit conflicting comments or score overrides. The last write wins — score overrides use a delete-then-insert transaction (`overrides/route.ts:100-118`) which is race-safe for atomicity but does not prevent two TAs from overriding the same student's score simultaneously. There is no "TA Alice is currently reviewing this submission" lock or notification.

For a course with 300 students and 3 TAs, this will cause duplicated grading effort and disputes over who owns which submission.

---

### BUG-9 — LOW: problem-sets visibility excludes TAs
**Severity: LOW**

`visibility.ts:89-112`: `getManageableProblemSetGroupIds` only considers group owners and `co_instructor` entries — `eq(groupInstructors.role, "co_instructor")`. Group TAs are excluded from seeing problem sets assigned to their groups. A TA cannot browse the problem set their students are working on unless it is public.

---

## Capability Matrix Table (assistant role)

| Capability | In assistant role? | Actual behavior | Gap / note |
|---|---|---|---|
| `content.submit_solutions` | YES | Can submit to assignments | OK |
| `content.view_own_submissions` | YES | Can view own submissions | OK |
| `submissions.view_all` | YES | Sees ALL submissions system-wide | **BUG-1**: should be group-scoped |
| `submissions.view_source` | YES | Can read source code | OK given BUG-1 fix |
| `submissions.rejudge` | **NO** | 403 on rejudge API | **BUG-3**: needed for TA work |
| `submissions.comment` | **NO** | 403 on comment API | **BUG-3**: needed for TA work |
| `assignments.view_status` | YES | Can view assignment progress | OK |
| `assignments.create` | NO | Cannot create assignments | Acceptable for basic TA |
| `assignments.edit` | NO | Cannot edit assignments | Gap for co-TA workflows |
| `assignments.delete` | NO | Cannot delete | Correct |
| `problems.view_all` | YES | Can see private problems | OK |
| `problems.create` | NO | Cannot author problems | Gap |
| `problems.edit` | NO | Cannot fix typos | Gap |
| `problems.delete` | NO | Cannot delete | Correct |
| `groups.view_all` | NO | Cannot see all groups | Correct |
| `groups.manage_members` | NO | Cannot add/remove students | Gap for section TAs |
| `anti_cheat.view_events` | YES | Can see events in contest UI | OK; no non-contest UI (BUG-6) |
| `anti_cheat.run_similarity` | **NO** | Cannot trigger plagiarism scan | **BUG-5** |
| `files.upload` | YES | Can upload files | OK |
| `users.view` | NO | Cannot see user list / emails | Correct (privacy) |
| `community.moderate` | NO | Cannot moderate discussions | Gap |
| `contests.view_analytics` | NO | Cannot view contest analytics | Gap |
| `contests.view_leaderboard_full` | NO | Cannot see frozen leaderboard | Gap |
| System capabilities | NO | All blocked | Correct |

Highlighted gaps in bold: rejudge, comment, run_similarity are the critical missing pieces.

---

## group_instructors.role Enforcement Audit (the Historical Bug)

**Prior state (April 2026 review):** `group_instructors.role` was stored but ignored. Both `ta` and `co_instructor` produced identical (zero) permission elevation beyond basic group access.

**Current state:**

`co_instructor` — **FIXED**. `management.ts:82-85` explicitly checks `assignedRole === "co_instructor"` and returns `true` from `canManageGroupResourcesAsync`. Co-instructors can now create/edit assignments, manage members, add score overrides, and manage the instructor list for their assigned group. This is the correct behavior.

`ta` — **STILL BROKEN**. The `ta` case is handled only in `canManageGroupMembersAsync` (`management.ts:93-113`), and only when the TA's system role already carries `groups.manage_members` capability (which `assistant` does not have). In every other code path — rejudge, comment, score override, assignment edit, anti-cheat run — `ta` in `group_instructors.role` produces the same result as having no entry at all.

Summary: the regression is **half-fixed**. The `co_instructor` path now works. The `ta` path is still a no-op for all actionable capabilities.

The deeper architectural problem: capability checks are role-based (system-wide), not context-based (per-group). The `group_instructors.role` field is a group-scoped role but the capability system has no concept of group-scoped capability elevation. To properly fix `ta`, you need either:
1. A middleware that elevates capabilities in-request based on the group being accessed, or
2. Explicit group-context checks in each protected handler (the `hasGroupInstructorRole` pattern already used in `canViewAssignmentSubmissions`).

Option 2 is already partially implemented — `canViewAssignmentSubmissions` calls `hasGroupInstructorRole` which accepts any `group_instructors` entry regardless of role. The pattern needs to be extended to `submissions.comment`, `submissions.rejudge`, and score override authorization.

---

## Grading Workflow Assessment

There is no grading queue. The flow a TA would need to use:

1. Navigate to `/dashboard/admin/submissions` — accessible with current `submissions.view_all`, but should be group-scoped (BUG-1).
2. Filter by group — the group filter dropdown works.
3. Click a submission — reaches the submission detail page.
4. Leave a comment — **blocked** (BUG-3, `submissions.comment` missing).
5. Rejudge if verdict looks wrong — **blocked** (BUG-3, `submissions.rejudge` missing).
6. Override score — **blocked** (BUG-4, `canManageGroupResourcesAsync` blocks TAs).

Effective grading actions available to a TA today: zero. They can read source code and that is all.

Additionally:
- No "mark for human review" status exists. There is no way for a TA to flag a submission for instructor attention without leaving an out-of-band message.
- No "graded by" field on comments or overrides beyond the audit log. The status board shows scores but not who last touched them.
- No collision prevention — two TAs grading simultaneously is undetected.
- The `score_overrides` table has `created_by` which is recorded; this is the only per-override attribution trail.

---

## Privacy and Scope-of-Access Assessment

**Student emails:** An assistant (no `users.view`) cannot reach the users admin list. They cannot call `GET /api/v1/users/:id` for other users (the route blocks non-self calls without `users.view`). The groups API strips emails when `canManageGroupResourcesAsync` is false. Privacy is intact for the default `assistant` role.

**Student names:** The submissions page renders `user.name` for every visible submission. With `submissions.view_all` (BUG-1), a TA sees all student names platform-wide, not just their section. After BUG-1 fix, this scope shrinks to assigned groups only, which is appropriate.

**Cross-group submission access:** Before BUG-1 fix, a TA assigned only to CS101 can see CS201 submissions. This is the most acute privacy issue — it violates the basic expectation that a TA only sees their own section's work.

**Anti-cheat events:** `anti-cheat/route.ts:149,168-184` gates on `canManageContest` (group owner or co_instructor). An assistant with `anti_cheat.view_events` capability cannot actually read anti-cheat events via the API — the route does not check that capability, it only checks `canManageContest`. So the capability is granted but there is no accessible API endpoint for it outside of being a group manager. This creates a confusing inconsistency: the capability says "view events" but the actual access path requires management-level group membership.

**PII in anti-cheat events:** The GET response at line 171-176 includes `userName`, `username`, `ipAddress`, and `userAgent`. These are visible to anyone who passes `canManageContest`. There is no instructor-controlled option to hide IP addresses from co-instructors or TAs.

**Audit logs:** `/dashboard/admin/audit-logs/page.tsx:164-165`: the audit log page distinguishes `isAdminViewer` (has `users.edit`) from `isInstructorViewer`. Assistants have neither, so they cannot reach audit logs. This is correct — TAs should not audit-log the auditors.

---

## Recommended Changes

Ordered by impact:

**1. [CRITICAL] Remove `submissions.view_all` from assistant defaults; use `assignments.view_status` instead.**
File: `src/lib/capabilities/defaults.ts:20`
Effect: fixes BUG-1, restores group-scoped visibility via the existing `getSubmissionReviewGroupIds` path.

**2. [CRITICAL] Add `submissions.comment` to assistant defaults.**
File: `src/lib/capabilities/defaults.ts`
The comment API already has full access-control (checks `canAccessSubmission`). Adding this capability lets TAs leave inline feedback without granting any unintended access.

**3. [HIGH] Add `submissions.rejudge` to assistant defaults, or add a group-TA shortcut in the rejudge route.**
File: `src/lib/capabilities/defaults.ts` and/or `rejudge/route.ts`
Option A: add capability to assistant role (simplest, audit-logged).
Option B: add `hasGroupInstructorRole` check in the rejudge handler as a fallback path for group TAs who lack the capability.

**4. [HIGH] Extend score override authorization to group TAs.**
File: `src/app/api/v1/groups/[id]/assignments/[assignmentId]/overrides/route.ts:47`
`authorizeAssignmentAccess` should fall through to `hasGroupInstructorRole` when `canManageGroupResourcesAsync` returns false, or `canManageGroupResourcesAsync` should be updated to return `true` for `ta` group role when the action is score override (not assignment deletion).

**5. [HIGH] Enforce `anti_cheat.run_similarity` in the similarity-check route.**
File: `src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts:12`
Add `auth: { capabilities: ["anti_cheat.run_similarity"] }` to `createApiHandler` options, or check `caps.has("anti_cheat.run_similarity")` in the handler. Also add this capability to assistant defaults.

**6. [MEDIUM] Add a group-scoped anti-cheat view for non-contest assignments.**
Currently `anti_cheat.view_events` in the assistant role grants nothing actionable — there is no UI or API path that uses it outside the contest detail page. Either add a standalone anti-cheat events page for regular assignments or document that the capability only applies to contests.

**7. [MEDIUM] Add a minimal grading queue.**
A `submission_reviews` table with `(submission_id, reviewer_id, claimed_at, status)` would allow TAs to claim submissions, prevent collisions, and give instructors visibility into grading progress. Without this, multi-TA courses will have coordination problems.

**8. [LOW] Rename or document `users.view` as a PII-granting capability.**
`safeUserSelect` returns `email`. Any role granted `users.view` gets access to all user emails. The capability name is not self-documenting about this. Add a code comment and/or split into `users.view` (names/usernames only) and `users.view_pii` (includes email).

**9. [LOW] Include group TAs in problem-set visibility.**
File: `src/lib/problem-sets/visibility.ts:89-112`
Add `groupInstructors.role` filter to also include `ta` entries, not just `co_instructor`, so TAs can see the problem sets their students are working on.

**10. [LOW] Fix the `assistant` dashboard view to show only assigned groups.**
The instructor dashboard (`_components/instructor-dashboard.tsx:29`) calls `getAssignedTeachingGroupIds(userId)` and already scopes the view correctly. But after BUG-1 fix, verify the submissions page group filter defaults to the TA's assigned groups rather than "All Groups" to avoid manual filtering on every visit.
