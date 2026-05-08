# TA/Assistant Perspective Review — JudgeKit

**Reviewer role**: Teaching Assistant
**Date**: 2026-05-03
**Compared against**: April 17 review (score: 6.5/10), May 3 live probe (score: 3/10)

---

## Score by area

| Area | Score | Key change since April |
|---|---|---|
| Role Definition | 8/10 | +2 — Now has comment, rejudge, run_similarity; group-scoped via assignments.view_status |
| Group-Level Permissions | 7/10 | +3 — `submissions.view_all` removed; scoped to assigned groups via view_status |
| Submission Review | 7/10 | +2 — Can now rejudge and comment; still no score override |
| Problem/Assignment Assistance | 4/10 | +1 — Can view; still cannot create or edit |
| Communication | 5/10 | = — No moderation, no messaging tools |
| Anti-Cheat Access | 7/10 | +2 — Can now run similarity checks; view events |

**Overall: 7/10** (up from 6.5/10; the May 3 live probe's 3/10 was based on the old capability set before the fix was deployed)

---

## What got better

### 1. Group-scoped access is now real
The `assistant` role no longer includes `submissions.view_all`. Instead, `assignments.view_status` triggers the scoped path at `submissions.ts:165-179`, which restricts the assistant to their assigned teaching groups. A TA for CS101 no longer sees every submission across the platform.

### 2. Can now rejudge, comment, and run similarity
`ASSISTANT_CAPABILITIES` now includes `submissions.comment`, `submissions.rejudge`, and `anti_cheat.run_similarity`. These were the three most critical missing capabilities for real TA workflows. A TA who spots a judge error can fix it; a TA who wants to leave feedback can comment; a TA who suspects plagiarism can investigate.

### 3. View source code
`submissions.view_source` allows TAs to see the actual code students submitted, which is essential for providing meaningful feedback.

---

## What still needs work

### F1. No score override for TAs (HIGH)
The `ScoreOverrideDialog` gates on `canManageGroupResourcesAsync` which only honours `co_instructor`, not `ta`. A TA who notices an obvious grading error (e.g., a correct solution marked wrong due to a judge bug) cannot adjust the score themselves. They must escalate to an instructor.

### F2. Cannot create or edit problems (MEDIUM)
TAs who author practice problems for their sections are still blocked. This is a common TA duty at most universities — TAs write lab problems, practice quizzes, and supplemental exercises.

### F3. Cannot create or edit assignments (MEDIUM)
TAs who help set up lab assignments are blocked. They can view assignment status but cannot create new assignments or adjust deadlines.

### F4. No community moderation (MEDIUM)
TAs cannot moderate discussion posts, even in their own course's discussion forum. The `community.moderate` capability is instructor-only.

### F5. `group_instructors.role='ta'` still not fully respected (MEDIUM)
The TA role in `group_instructors` is now partially respected (via `assignments.view_status` scoping), but `canManageGroupResourcesAsync` still doesn't honour it for score overrides and other management actions. The co_instructor role is fully supported; the ta role is halfway there.

---

## Recommended next steps for TA capabilities

| Capability | Current | Recommended | Reason |
|---|---|---|---|
| `submissions.rejudge` | Granted | Granted (done) | TA fixes judge errors |
| `submissions.comment` | Granted | Granted (done) | TA provides feedback |
| `anti_cheat.run_similarity` | Granted | Granted (done) | TA investigates plagiarism |
| Score override | Blocked | Grant for TA in `canManageGroupResourcesAsync` | TA corrects obvious grading errors |
| `problems.create` | Blocked | Grant | TA authors practice problems |
| `problems.edit` | Blocked | Grant (own problems only) | TA fixes typos in their own problems |
| `assignments.create` | Blocked | Consider | TA sets up lab assignments |
| `community.moderate` | Blocked | Grant (scoped to own groups) | TA moderates own course discussions |

---

## Summary

The assistant role went from "nearly useless read-only observer" to "functional TA with group-scoped access." The three most important capabilities (rejudge, comment, run_similarity) are now granted. The remaining gaps (score override, problem creation, community moderation) are MEDIUM priority — they'd make the role fully usable but aren't blockers. The biggest remaining architectural issue is that `group_instructors.role='ta'` is still not fully respected in all permission checks.
