# Assistant (TA) Review — JudgeKit — 2026-05-15

**Reviewer persona:** Graduate TA assigned to CS101. Grades weekly assignments, holds office hours, and needs to leave feedback on student submissions. Has `assistant` role in JudgeKit and is listed as `group_instructors.role='ta'` for the CS101 group. Cannot access student data outside their assigned group.
**Method:** Inspected `src/lib/capabilities/defaults.ts`, `src/lib/assignments/management.ts`, `src/app/(dashboard)/dashboard/assistant/`, and submission-review code paths. Tested what an assistant can and cannot do against the stated permission model.
**Scope:** Grading workflow, data boundaries, permission correctness, daily usability.

## Verdict

| Dimension | Score | One-line summary |
|---|---|---|
| Submission review | **5/10** | Can view source code and leave comments (fixed since May 3). But `submissions.view_all` in capabilities bypasses group scope — sees every submission on the platform. |
| Score override | **2/10** | Cannot override autograder scores. `canManageGroupResourcesAsync` ignores `ta` role. |
| Group management | **3/10** | Can view group member lists but cannot bulk-enroll, cannot manage access codes, and cannot see group-level analytics. |
| Anti-cheat review | **6/10** | Can view anti-cheat events and run similarity checks for assigned groups. Useful for flagging suspicious patterns. |
| Assignment creation | **0/10** | Cannot create or edit assignments. The assistant role is strictly view+comment. |

**Overall assistant utility: 3.5/10.** The assistant role exists on paper but is only half-functional. The most critical fix — removing `submissions.view_all` from capabilities to activate group scoping — is a one-line change that has been recommended in three review cycles.

---

## What the assistant role CAN do (verified against code)

1. **View source code for submissions** — `submissions.view_source` is in `ASSISTANT_CAPABILITIES`. Works.
2. **Leave comments on submissions** — `submissions.comment` was added in cycle 6. Works.
3. **Rejudge submissions** — `submissions.rejudge` is in capabilities. The re-judge action triggers the judge worker to re-evaluate. Works.
4. **View anti-cheat events** — `anti_cheat.view_events` is present. Can see tab-switch, copy/paste, heartbeat data for assigned groups.
5. **Run code similarity checks** — `anti_cheat.run_similarity` is present. Can compare submissions within scope.
6. **View problem catalog** — `problems.view_all` is present. Can browse all problems (intentionally, for grading context).
7. **View assignment status** — `assignments.view_status` is present. Can see the assignment overview and student progress table.

---

## What the assistant role CANNOT do (and should be able to)

### BUG-1. Sees submissions from groups they are not assigned to (HIGH)
**Where:** `src/lib/capabilities/defaults.ts:21`, `src/lib/assignments/submissions.ts:165-179`.
`ASSISTANT_CAPABILITIES` includes `submissions.view_all`. The `getSubmissionReviewGroupIds` function only activates its group-scope filter when the user LACKS `submissions.view_all`. Because assistants have it, the filter is skipped. A TA for CS101 sees Physics301 submissions, including source code and student names.

**The fix is trivial:** Remove `submissions.view_all` from `ASSISTANT_CAPABILITIES`. The existing group-scope filter will then restrict to `groupInstructors` rows automatically. This was recommended in cycles 1, 3, 5, and 6.

**Workaround today:** None. The TA must manually ignore cross-group submissions.

### BUG-2. Cannot override scores (HIGH)
**Where:** `src/lib/assignments/management.ts:82-85`.
`canManageGroupResourcesAsync` checks `role === "co_instructor"`. The `ta` value in `group_instructors.role` is treated as cosmetic. A TA cannot fix an autograder false-negative, cannot award partial credit for a creative solution, and cannot handle edge cases.

**Fix:** Change the check to `role === "co_instructor" || role === "ta"`.
**ETA:** 15 minutes.

### BUG-3. Cannot create or edit assignments (by design, but inconvenient)
**Where:** `src/lib/capabilities/defaults.ts`.
`assignments.create` and `assignments.edit` are not in `ASSISTANT_CAPABILITIES`. This is intentional — TAs should not create assignments. But in practice, many professors delegate "create next week's homework" to their TAs. The capability system supports this (just add the capability to a custom role), but there is no "TA+" preset.

**Fix:** Add a "TA (Extended)" custom role preset with `assignments.create`, `assignments.edit`, and `problems.create`. Or document how professors can create custom roles for their TAs.
**ETA:** 1 hour.

### BUG-4. No group-scoped analytics (MEDIUM)
**Where:** `src/app/(dashboard)/dashboard/admin/assignments/[id]/analytics/page.tsx`.
The analytics page requires `contests.view_analytics` capability, which is not in `ASSISTANT_CAPABILITIES`. A TA cannot see solve-rate distributions, time-to-solve histograms, or problem difficulty curves for their group. These are essential for identifying which problems students struggled with.

**Fix:** Add `contests.view_analytics` to `ASSISTANT_CAPABILITIES`, but gate the API endpoint on group-scope filter.
**ETA:** 2 hours.

### BUG-5. Cannot manage group enrollments (MEDIUM)
**Where:** `src/lib/capabilities/defaults.ts`.
`groups.manage_members` is not in `ASSISTANT_CAPABILITIES`. A TA cannot add late-enrolling students to their group, remove dropouts, or fix enrollment errors. They must ask the professor (or admin) to do it.

**Fix:** Add `groups.manage_members` to `ASSISTANT_CAPABILITIES`, with group-scope enforcement.
**ETA:** 1 hour.

---

## Comparison: What a TA needs vs what JudgeKit gives

| Task | Needs | Has | Gap |
|---|---|---|---|
| Grade submissions for my group | Source code, verdict, execution time, ability to comment | All of the above | Cross-group leakage (BUG-1) |
| Fix autograder false-negative | Score override | Not allowed (BUG-2) | Cannot do core TA job |
| Identify struggling students | Per-problem solve rates, time distributions | Not allowed (BUG-4) | No data for office hours prep |
| Add late student to group | Enroll user into group | Not allowed (BUG-5) | Friction for routine ops |
| Flag suspected cheating | Similarity check + anti-cheat events | Yes | Works correctly |
| Leave feedback on code | Inline comments | Yes | Works correctly |

---

## Recommendation

The assistant role needs two changes to be usable:
1. **Remove `submissions.view_all` from capabilities** (activates group scoping — 1 line).
2. **Respect `ta` in `canManageGroupResourcesAsync`** (enables score override — 1 line).

These are trivial fixes that have been identified for 12 days. Without them, the assistant role is a liability — it gives TAs enough access to see sensitive data across groups but not enough to do their actual job.
