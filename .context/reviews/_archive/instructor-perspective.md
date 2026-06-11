# Instructor Perspective Review -- JudgeKit Platform

**Reviewer role**: University instructor managing 200-student courses with timed midterm/final exams
**Date**: 2026-05-04
**Scope**: Problem creation, assignment/contest setup, group management, grading, anti-cheat, analytics, recruiting, bulk operations, error recovery

---

## Executive Summary

JudgeKit is a well-architected competitive programming judge with strong fundamentals in contest management, anti-cheat, and scoring. The platform demonstrates mature engineering decisions (DB-server time to avoid clock skew, atomic transactions for exam sessions, leaderboard freeze support). However, the instructor experience has notable gaps in bulk workflows, error recovery during live exams, and some UX friction points that would cause real stress during a 200-student midterm.

---

## Critical Issues

### 1. No mid-exam error recovery or instructor override for locked-out students

**File**: `/src/lib/assignments/exam-sessions.ts`

The exam session system uses `onConflictDoNothing` (line 101) and is idempotent, which is good. However, if a student's browser crashes or their session expires mid-exam, there is no visible instructor mechanism to reset or extend their personal deadline. The `getExamSession` function returns the session but there is no `resetExamSession` or `extendExamSession` function. During a 200-student midterm, at least 5-10 students will have browser issues. Without an instructor override, the instructor must contact the platform admin, which is unacceptable during a live exam.

### 2. No bulk score override or bulk grading operations

**File**: `/src/app/(dashboard)/dashboard/groups/[id]/assignments/[assignmentId]/score-override-dialog.tsx`

The score override dialog works on individual (problem, user) pairs only. For a 200-student class with 5 problems, adjusting scores for a problem that had a flawed test case requires clicking through up to 200 individual dialogs. There is no "override all scores for problem X" or "add N points to all submissions for problem X" operation. This is a workflow catastrophe during grading.

### 3. Assignment form dialog is too cramped for complex exam setup

**File**: `/src/app/(dashboard)/dashboard/groups/[id]/assignment-form-dialog.tsx`

The assignment creation/editing form is a modal dialog (`DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl"`). For a non-trivial exam setup, the instructor must configure: title, description, start/deadline times, late deadline, late penalty, exam mode, visibility, scoring model, freeze time, anti-cheat toggle, results visibility, score hiding, and individual problem selections with points. All of this in a single scrolling modal. This is overwhelming. Exam configuration should be a full page, not a dialog.

### 4. No "duplicate assignment to another group" workflow

**File**: `/src/app/(dashboard)/dashboard/groups/[id]/assignment-form-dialog.tsx`

An instructor teaching multiple sections (e.g., CS101-A and CS101-B) must recreate the same exam assignment from scratch for each group. The duplicate feature only works within the same group. Cross-group duplication would save significant time for multi-section courses.

### 5. Problem selector in assignment form is a flat dropdown

**File**: `/src/app/(dashboard)/dashboard/groups/[id]/assignment-form-dialog.tsx` (lines 620-640)

The problem selector is a `<Select>` dropdown listing all available problems by title. With 100+ problems, this becomes an unscrollable wall. There is no search, no filtering by tag, no grouping by problem set. An instructor must visually scan the entire list for each problem they want to add.

---

## Minor Issues

### 6. Problem creation description editor is a plain textarea

**File**: `/src/app/(dashboard)/dashboard/problems/create/create-problem-form.tsx` (lines 540-570)

The description field is a raw `<Textarea>` with a preview tab. There is no markdown toolbar (bold, italic, code block, headings, lists). Image upload is supported via drag/paste, but only if `canUploadFiles` is true (which depends on configuration). An instructor writing a complex problem statement with math notation, code samples, and formatting must know markdown syntax from memory. A toolbar would significantly reduce friction.

### 7. Test case management lacks bulk import feedback

**File**: `/src/app/(dashboard)/dashboard/problems/create/create-problem-form.tsx` (lines 166-216)

The ZIP import feature is excellent, but the naming convention (`1.in`, `1.out`) is only documented in code, not in the UI. The error message `zipImportNoPairs` and `zipImportFailed` are generic. An instructor who names files `input1.txt` / `output1.txt` will get a cryptic error with no guidance on the expected format.

### 8. No test case validation or dry-run before saving

**File**: `/src/app/(dashboard)/dashboard/problems/create/create-problem-form.tsx`

When creating a problem, there is no way to test-run the problem against the test cases before saving. The instructor must create the problem, then navigate to it and submit a solution to verify the test cases work. This is a common workflow in other judges (e.g., "Run on sample" or "Preview judge output").

### 9. Exam mode options lack concrete examples

**File**: `/src/app/(dashboard)/dashboard/groups/[id]/assignment-form-dialog.tsx` (lines 417-457)

The exam mode descriptions (`examModeDescription_none`, `examModeDescription_scheduled`, `examModeDescription_windowed`) are presumably brief. For an instructor setting up their first exam, the difference between "scheduled" (everyone starts and ends at the same time) and "windowed" (each student gets N minutes from when they start) needs concrete examples: "Use scheduled for a synchronized midterm. Use windowed for a take-home exam with a 48-hour window."

### 10. Leaderboard freeze time requires manual datetime input

**File**: `/src/app/(dashboard)/dashboard/groups/[id]/assignment-form-dialog.tsx` (lines 506-515)

The freeze leaderboard field is a raw `datetime-local` input. There is no option to say "freeze 30 minutes before deadline" or "freeze at contest end." The instructor must manually calculate and enter the exact datetime, which is error-prone.

### 11. Anti-cheat similarity check is manual-only

**File**: `/src/components/contest/anti-cheat-dashboard.tsx` (lines 243-294)

The code similarity check must be triggered manually by clicking a button. There is no automatic similarity check at contest end, no scheduled check, and no threshold configuration in the UI (the default is 0.85). For a post-exam review, the instructor must remember to click the button. An automatic check on contest close would be more reliable.

### 12. Anti-cheat event types are not customizable

**File**: `/src/lib/anti-cheat/review-model.ts`

The anti-cheat system tracks fixed event types (heartbeat, blur, contextmenu, copy, paste, tab_switch, ip_change, code_similarity) with hardcoded tiers (context, signal, escalate). An instructor cannot adjust sensitivity or add custom rules. For example, "tab_switch" during a coding exam might be normal (checking documentation), but during a multiple-choice exam it should be escalated.

### 13. No student-facing "exam instructions" or pre-exam checklist

The exam system starts immediately when the student clicks "Start Exam." There is no configurable pre-exam instructions screen, no acknowledgment checkbox ("I understand this is a timed exam"), and no system check ("Your browser is compatible"). This is standard for proctored exam platforms.

### 14. Access code system lacks instructor-facing documentation

**File**: `/src/lib/assignments/access-codes.ts`

Access codes use a carefully designed character set (no I/O/0/1 for readability) and are 8 characters. However, there is no UI documentation explaining how to distribute codes to students. The `generateAccessCode` function is well-implemented, but the instructor workflow for "share this code with your students" is not surfaced.

### 15. Group member table has no export functionality

**File**: `/src/app/(dashboard)/dashboard/groups/[id]/group-members-manager.tsx`

The group members table shows name, username, and class but has no export-to-CSV button. An instructor who needs to cross-reference enrollment with their university LMS must manually copy data. The bulk paste import exists (good), but the reverse direction is missing.

### 16. Analytics charts are SVG-only, no interactive tooltips

**File**: `/src/components/contest/analytics-charts.tsx`

The analytics charts use raw SVG with `<title>` elements for tooltips. These are browser-native tooltips that appear on hover with a delay and no styling. For an instructor reviewing post-exam analytics, interactive charts with styled tooltips, zoom, and data point details would be significantly more useful. The current implementation is functional but primitive.

### 17. Contest replay lacks export or shareable link

**File**: `/src/components/contest/contest-replay.tsx`

The contest replay feature is a nice post-contest visualization, but there is no way to export the replay as a video/GIF or share it with students. This limits its use to instructor-only review.

### 18. Score override dialog lacks audit trail visibility

**File**: `/src/app/(dashboard)/dashboard/groups/[id]/assignments/[assignmentId]/score-override-dialog.tsx`

The score override accepts a `reason` field, but there is no visible audit trail for the instructor. After overriding 50 scores, there is no way to see "which overrides did I apply and why" without querying the database directly. An audit log view would be essential for grade disputes.

---

## Suggestions for Improvement

### High Priority

1. **Add exam session extension/reset**: Allow instructors to extend a student's personal deadline or reset their exam session. This is critical for live exam support.

2. **Add bulk score operations**: "Add N points to all students for problem X" or "Override all scores for problem X to value Y" would save hours during grading.

3. **Convert assignment form to a full page**: Replace the modal dialog with a multi-step wizard or full page with collapsible sections for each configuration area.

4. **Add cross-group assignment duplication**: Allow duplicating an assignment (with problems and configuration) to another group.

5. **Add problem search/filter in assignment form**: Replace the flat dropdown with a searchable, filterable problem picker.

### Medium Priority

6. **Add markdown toolbar to problem description editor**: Bold, italic, code block, heading, list, link, image buttons.

7. **Document ZIP import format in the UI**: Show expected naming convention (`1.in`/`1.out` or `01.input`/`01.output`) with a tooltip or help text.

8. **Add automatic similarity check on contest close**: Run code similarity check automatically when the contest deadline passes.

9. **Add group member export**: CSV/Excel export button for the members table.

10. **Add score override audit log**: A view showing all overrides with timestamps, reasons, and the instructor who applied them.

### Low Priority

11. **Add "freeze relative to deadline" option**: "Freeze 30 minutes before deadline" instead of manual datetime.

12. **Add pre-exam instructions screen**: Configurable text that students see before starting an exam.

13. **Upgrade analytics charts**: Use a proper charting library (e.g., Recharts, Chart.js) for interactive, styled charts.

14. **Add problem test-run/preview**: Allow instructors to test their problems before publishing.

15. **Add contest replay export**: Export replay as GIF/video for sharing with students.

---

## What Works Well

- **DB-server time usage throughout**: The consistent use of `getDbNowMs()` and `NOW()` in SQL to avoid clock skew is excellent engineering. This prevents the class of bugs where an exam "ends" on the app server but the DB still thinks it is running.

- **Leaderboard freeze with live rank**: Showing students their frozen rank while computing their live rank behind the scenes (line 90-217 of `leaderboard.ts`) is a sophisticated feature that most judges lack.

- **ICPC and IOI scoring models**: Supporting both scoring models with proper tie-breaking (including epsilon comparison for floating-point scores) shows attention to competitive programming standards.

- **Anti-cheat review tier model**: The three-tier system (context/signal/escalate) with a disclaimer about not using signals alone for academic integrity decisions is responsible and well-designed.

- **Code similarity detection**: The combination of source normalization (strip comments, whitespace, string literals), identifier normalization (replace with placeholders), and n-gram Jaccard similarity is a solid approach. The Rust sidecar fallback to TypeScript is pragmatic.

- **Recruiting invitation system**: Token-based invitations with brute-force protection, atomic redemption, and password reset flow is production-grade security.

- **Bulk enrollment via paste**: The paste-list enrollment feature (newline/comma/semicolon/tab separated) is exactly what instructors need for LMS integration.

- **Unsaved changes guard**: The `useUnsavedChangesGuard` hook in the problem creation form prevents accidental data loss.

- **Contest announcements and clarifications**: The quick-answer buttons (Yes/No/No Comment/Custom) for clarifications show understanding of the real contest management workflow.

- **Visibility-aware polling**: Using `useVisibilityPolling` to pause API calls when the browser tab is hidden is a thoughtful performance optimization.

---

## Overall Grade: B+

JudgeKit is a strong platform with excellent engineering fundamentals. The scoring, anti-cheat, and contest management features are production-grade and show deep understanding of competitive programming workflows. The critical gaps are in instructor bulk operations and live exam error recovery -- areas that matter most during a high-stakes 200-student midterm. The platform would benefit most from: (1) exam session instructor overrides, (2) bulk grading operations, and (3) converting the assignment dialog to a full page. These three changes would move it from "good for contests" to "reliable for university courses."