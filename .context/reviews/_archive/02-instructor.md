# Instructor Perspective Review: JudgeKit

**Reviewer role**: Instructor / Course Administrator
**Date**: 2026-04-17 (Post-Plan-008)
**Codebase**: `/Users/hletrd/flash-shared/judgekit`

---

## 1. Problem Authoring — 7/10

**What works well:**

The problem creation form is thorough: Markdown editor with live preview, image upload via paste/drag-drop, test case management with per-case visibility toggles, ZIP batch import parsing `1.in`/`1.out` naming conventions, configurable time/memory limits, comparison modes (exact and float with tolerances), difficulty tagging, visibility controls, autocomplete tag input, problem type toggle (auto-judged vs. manually graded), student visibility toggles (compile output, detailed results, runtime errors, AI assistant), problem import/export, and test case locking once submissions exist.

**What needs improvement:**

- **No rich-text editor toolbar.** The description field is a plain textarea. Instructors writing problem statements must know Markdown syntax. A toolbar (bold, code block, math formula) would significantly lower the barrier.
- **No batch test case creation from clipboard.** ZIP upload exists, but there is no way to paste multiple test cases at once from a problem statement PDF.
- **Difficulty is a raw number.** The 0-10 float scale is opaque. Most OJ platforms use Easy/Medium/Hard or named tiers. A dropdown with named tiers would be more intuitive.
- **No file attachments.** No way to attach starter code templates or data files. Instructors must link externally or embed in the description.
- **No problem duplication/cloning.** To create a variant, the instructor must manually re-enter everything.
- **Test case ordering is implicit.** The `sortOrder` field exists but there is no drag-and-drop or explicit reordering UI.
- **Per-language time limits not supported.** Python needs 5x the time of C++, but the time limit is per-problem. Instructors must create separate problems for each language tier.
- **Problem edit page hardcodes role check.** Lines 29-33 of `edit/page.tsx` use `session.user.role === "admin"` instead of capability checks, bypassing the capability system.

---

## 2. Assignment Management — 7.5/10

**What works well:**

Assignment creation covers all essential fields: problems with points, deadlines, exam mode (scheduled/windowed), late penalty, anti-cheat toggle, auto-judge mode. The status board now has mobile card view with collapsible details. Score override dialog exists with reason field. The new analytics dashboard at `/dashboard/groups/:id/analytics` shows member count, assignment count, total submissions, avg overall score, and per-assignment performance table with avg/min/max/high scores and submission rates.

**What needs improvement:**

- **Assignment creation is a dialog, not a full page.** For forms with many problem rows, exam settings, anti-cheat toggles, and deadlines, a modal (`max-h-[85vh] overflow-y-auto`) is cramped. Works for quick edits, poor for initial creation.
- **No personal deadline management UI.** The `personalDeadline` field exists in data queries but there is no UI for instructors to set per-student deadlines or extensions.
- **Score override lacks audit trail visibility.** The reason field is saved but there is no visible history of overrides anywhere.
- **Late penalty is only a flat percentage.** No support for tiered late penalties (e.g., 10% off per day).
- **No assignment duplication.** Cannot clone assignments for reuse across semesters.
- **No bulk score operations.** Cannot curve or scale all scores for an assignment in one action.

---

## 3. Contest Management — 8/10

**What works well:**

The contest system is the platform's strongest feature. Dual scoring models (ICPC/IOI), freeze periods, animated replay between ranking snapshots, analytics charts (score distribution, solve rates, solve times, anti-cheat summary, score progression), recruiting mode with token-based invitations, access code manager, and CSV export with formula injection protection. The leaderboard is well-implemented with live updates.

**What needs improvement:**

- **Quick-create form is too minimal.** Defaults to windowed exam mode with fixed duration, no scheduled-mode option, no scoring model selector, no visibility toggle, no group selection.
- **Contest creation has two disconnected paths.** "Quick create" vs. "create from group" — the group-based path requires creating an assignment via a generic form, which is confusing.
- **Leaderboard freeze is a single timestamp.** No unfreeze action or publish-leaderboard toggle — purely time-based.
- **Access code manager lacks bulk operations.** No way to generate multiple codes at once or export them.
- **No contest template system.** Cannot save configurations as reusable templates.
- **No virtual contest mode.** Students cannot practice past contests with the same time constraints.
- **No per-language time limit multipliers.** Python needs more time than C++ in contests, but time limits are per-problem.

---

## 4. User/Group Management — 6.5/10

**What works well:**

Admin user management supports creating, editing, and managing users with role assignment. Group management supports enrollment, instructor/co-instructor/TA assignment, and archiving. Invite participants dialog with search and bulk-add.

**What needs improvement:**

- **No group editing.** Groups can be created and archived, but there is no UI to rename a group, change its description, or reassign the primary instructor.
- **Student enrollment is one-at-a-time from a dropdown.** For a class of 200, this is impractical. No CSV import, no batch-add by username list.
- **Co-instructor/TA management is limited.** No way to assign per-assignment permissions to TAs (e.g., "can grade but cannot edit problems").
- **Instructors cannot see all groups.** Non-admin instructors see only groups they own or co-teach. No "browse all groups" view.
- **No user profile page for instructors.** No way to manage their own settings or see their teaching load.

---

## 5. Submission Monitoring — 6.5/10

**What works well:**

Admin submissions page now has sortable columns (submittedAt, score, status, language) with URL-based sorting. `formatScore` provides consistent score display. Rejudge is available per-submission. Anti-cheat dashboard shows flagged pairs, similarity percentages, and per-event review tier.

**What needs improvement:**

- **No bulk rejudge.** No "rejudge all" or "rejudge selected" capability. For a judge configuration change affecting hundreds of submissions, this is critical.
- **No submission filtering by assignment or problem on admin page.** Only searches by user name or problem title. No dropdown filters for assignment, language, status, or date range.
- **Anti-cheat is contest-only.** The `AntiCheatDashboard` and `AntiCheatMonitor` are embedded exclusively in the contest detail page. Regular assignments have no anti-cheat visibility.
- **Similarity check is synchronous and limited.** Can time out for large submission sets. No background job with progress indicator.
- **No plagiarism report export.** Flagged pairs cannot be exported as PDF or CSV for institutional records.
- **Diff view now works for failing test cases** (unified + side-by-side via `OutputDiffView`), but only in the submission detail page. The admin submissions list has no inline diff preview.

---

## 6. System Administration — 6/10

**What works well:**

Settings page covers site name, description, timezone, registration, default language, judge configuration. Backup/restore now includes file uploads in ZIP format. Audit logs have action type and date range filters. Health endpoint at `/api/v1/health` checks DB connectivity, uptime, and response time. Data retention policies with automated cleanup exist for audit/login/anti-cheat events.

**What needs improvement:**

- **Backup/restore is super-admin only.** The UI hardcodes `isSuperAdmin` instead of checking the `system.backup` capability.
- **No scheduled/automated backups.** Manual-only. No cron configuration.
- **Audit log lacks export.** Robust filtering but no CSV/JSON export button.
- **Login log lacks date range filter.** Only filters by outcome and search text, unlike the audit log.
- **No system health dashboard.** The health endpoint exists but there is no unified system health view (queue depth, error rate, disk usage, uptime).
- **No monitoring integration.** No Prometheus export, no Grafana dashboard, no alerting.

---

## 7. Analytics — 7/10

**What works well:**

Contest analytics are rich: score distribution, solve rates, solve times, anti-cheat summary, score progression. Group analytics dashboard now exists at `/dashboard/groups/:id/analytics` with assignment performance table and summary stats. `formatScore` provides consistent display.

**What needs improvement:**

- **Analytics are contest-only at the detailed level.** The rich `AnalyticsCharts` component is only in the contest detail page. Group analytics provides only a simple table with avg/min/max scores.
- **No per-problem analytics for non-contest problems.** No submission distribution over time, language breakdown, or error-type breakdown.
- **No cross-assignment or longitudinal analytics.** No way to see student performance trends across a semester.
- **Charts are custom SVG, not interactive.** Hand-coded `SVGBarChart`, `SVGStackedBar`, `SolveTimeChart` lack hover tooltips (beyond basic `<title>`), zoom, pan, or click-to-drill-down.
- **No analytics export.** No way to export aggregated data.
- **Group analytics uses raw SQL with `ANY` subquery** (line 71 of analytics/page.tsx) — currently safe but fragile pattern.

---

## 8. Assistant/TA Role — 6/10

**What works well:**

The `assistant` built-in role now exists in the capability system with view-only access to submissions, assignments, users, problems, anti-cheat events, and file uploads. Level 1 (between student and instructor). Display name "Assistant".

**What needs improvement:**

- **Assistants have view-only access to almost everything.** They cannot rejudge, comment on submissions, create/edit problems, create assignments, or run similarity checks. This makes the role nearly useless for actual TA duties like grading or managing submissions.
- **No `submissions.rejudge` or `submissions.comment` for assistants.** These are instructor-only. TAs who need to rejudge or leave feedback are blocked.
- **No assignment creation or editing for assistants.** TAs typically help set up assignments, but the capability system excludes them entirely.
- **No `anti_cheat.run_similarity` for assistants.** They can view events but cannot trigger a similarity check.
- **Group-level TA permissions are still broken.** The `group_instructors` table has `ta` and `co_instructor` entries, but most permission checks ignore `group_instructors.role`. A TA added to a specific group still gets either student-level or instructor-level access.
- **The defaults are too restrictive.** Most institutions would need to create a custom "TA" role immediately, which should be the default expectation.

---

## Summary Scorecard

| Area | Score | Key Issue |
|---|---|---|
| Problem Authoring | 7/10 | No rich-text toolbar, no problem cloning |
| Assignment Management | 7.5/10 | Dialog-based creation, no per-student deadlines |
| Contest Management | 8/10 | Best feature; needs virtual contest mode |
| User/Group Management | 6.5/10 | No batch enrollment, no group editing |
| Submission Monitoring | 6.5/10 | No bulk rejudge, anti-cheat contest-only |
| System Administration | 6/10 | No monitoring, no automated backups |
| Analytics | 7/10 | Rich contest analytics, thin elsewhere |
| TA Role | 6/10 | Role exists but too restrictive |
| **Overall** | **7/10** | Great contest system, course management needs investment |
