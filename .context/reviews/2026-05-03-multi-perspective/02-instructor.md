# Instructor Perspective Review — JudgeKit

**Reviewer role**: Instructor / Course Administrator
**Date**: 2026-05-03
**Compared against**: April 17 review, Gradescope, PrairieLearn, DOMjudge

---

## Score by area

| Area | Score | Key change since April |
|---|---|---|
| Problem Authoring | 7.5/10 | +0.5 — per-language TL multipliers help; no rich-text toolbar or problem cloning yet |
| Assignment Management | 8/10 | +0.5 — bulk enrollment, 4s undo, per-language TL; still no per-day late penalty |
| Contest Management | 8.5/10 | +0.5 — second worker documented, rankings fixed, CRON_SECRET fixed |
| User/Group Management | 8/10 | +1.5 — bulk enrollment via paste-list is the biggest operational win |
| Submission Monitoring | 7.5/10 | +1 — anti-cheat on homework, group-scoped TA view, heartbeat enforcement |
| System Administration | 7/10 | +1 — backup redaction, pre-restore snapshot, SECURITY.md |
| Analytics | 7.5/10 | +0.5 — per-language TL data available; still thin for non-contest |

**Overall: 8/10** (up from 7/10)

---

## What got better

### 1. Bulk student enrollment — the single biggest operational win
`group-members-manager.tsx` now accepts newline/comma/semicolon/tab-separated usernames. For a 200-student class, this goes from "impossible" to "paste from spreadsheet." This was the #1 adoption blocker and it's fixed.

### 2. Per-language time-limit multipliers
`languageConfigs.timeLimitMultiplier` in the schema, applied at judge claim time. Python can get 3x the C++ time limit on the same problem. This was a fairness defect that made the platform unsuitable for multi-language courses.

### 3. Anti-cheat now available for homework
The `AntiCheatDashboard` is no longer contest-only. Heartbeat enforcement means exam submissions are rejected without a live browser session. This is a structural improvement, not just a UI change.

### 4. Group-scoped assistant role
The `assistant` role now has `submissions.comment`, `submissions.rejudge`, and `anti_cheat.run_similarity` — and omits `submissions.view_all`, so TAs are restricted to their assigned groups. The `group_instructors.role='ta'` is now meaningful.

### 5. Pre-restore snapshot
Before any database restore, a `pg_dump` is taken automatically. If the restore fails or produces unexpected results, the instructor/admin can recover. This was a risk that made the backup/restore feature dangerous to use.

---

## What still needs work

### F1. No rubric-based grading (HIGH)
Manually-graded problems (`problemType === "manual"`) have no structured rubric system. An instructor grading 200 essays has no way to define criteria (correctness, style, efficiency), apply partial credit, or ensure consistency across TAs. Gradescope's rubric system is the standard here.

### F2. No assignment duplication/cloning (HIGH)
Cannot clone assignments for reuse across semesters. Every semester, the instructor must manually re-create assignments with the same settings, problems, and deadlines.

### F3. No LMS integration (HIGH)
No LTI 1.3, no Canvas/Moodle grade passback. For institutional adoption, every weekly grade column requires manual CSV export → import. This is the single biggest blocker for a university that already uses an LMS.

### F4. Flat late penalty only (MEDIUM)
Only supports a flat percentage penalty. Academic standard is per-day decay (e.g., 10% off per day, 0 after 5 days). The data model could support this with two additional columns.

### F5. No per-student deadline extensions UI (MEDIUM)
The `personalDeadline` field exists in the data model but there's no UI for instructors to grant extensions. A student with a documented accommodation must be handled outside the platform.

### F6. No bulk rejudge (MEDIUM)
No "rejudge all" or "rejudge selected" capability. When the judge configuration changes, each submission must be rejudged individually. For a class with hundreds of submissions, this is impractical.

### F7. Assignment creation is still a dialog, not a full page (MEDIUM)
For forms with many problem rows, exam settings, anti-cheat toggles, and deadlines, a modal (`max-h-[85vh] overflow-y-auto`) is cramped. Works for quick edits, poor for initial creation with 10+ problems.

### F8. No virtual contest mode (MEDIUM)
Students cannot practice past contests with the same time constraints. This is a feature every competitive programming platform offers (Codeforces virtual participation, BOJ virtual contest).

---

## Summary

JudgeKit went from "good contest system, course management needs investment" to "solid course management platform, contest system is best-in-class." The bulk enrollment, per-language TL multipliers, and group-scoped TA role were the three highest-impact fixes. The remaining gaps (rubrics, LMS integration, assignment cloning) are all solvable in a sprint or two. The platform is now ready for a real 150-student course pilot.
