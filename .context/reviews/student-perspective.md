# Student Perspective Review -- JudgeKit

**Reviewer**: Student user (university CS student using the platform for coursework, exams, and practice)
**Date**: 2026-05-04
**Scope**: All student-facing flows -- practice, exams, contests, submissions, profile, mobile, accessibility, i18n

---

## Executive Summary

JudgeKit is a well-engineered competitive programming judge with strong fundamentals: the code editor with CodeMirror integration, localStorage draft persistence, and keyboard shortcuts are solid. The exam system (windowed/scheduled modes, anti-cheat monitoring, countdown timer with server-time sync) is impressively thorough. However, several UX gaps -- particularly around problem statement rendering on mobile, the 4-second submit confirmation delay under exam pressure, and the absence of a "Run" result history -- would frustrate students during time-critical use.

---

## Critical Issues

### 1. The 4-second submit confirmation delay is hostile during exams

**File**: `src/components/problem/problem-submission-form.tsx` (lines 233-327)

Every submission goes through a 4-second "confirming" toast before actually submitting. The intent is to prevent accidental submissions, but during a timed exam with 5 minutes left, this delay feels agonizing. Students must either wait 4 seconds or click submit twice rapidly -- the latter is unintuitive and undiscoverable.

**Recommendation**: Add a profile setting or exam-mode flag to disable this delay. During exams, students are already under time pressure and are unlikely to submit accidentally.

### 2. Problem list table is not mobile-friendly

**File**: `src/app/(public)/_components/public-problem-list.tsx`

The practice problem list renders as a full-width table with 8 columns (number, title, solvers, success rate, difficulty, tags, progress, created date). On mobile, this requires horizontal scrolling, which hides most columns and makes the table nearly unusable. Unlike the submissions page (which has a dedicated mobile card layout at `src/app/(public)/submissions/page.tsx` lines 501-544), the problem list has no mobile-specific layout.

**Recommendation**: Add a card-based mobile layout similar to the submissions page, or collapse columns on small screens.

### 3. Keyboard shortcuts `n`/`p` for problem navigation conflict with text input

**File**: `src/app/(public)/practice/problems/[id]/problem-keyboard-nav.tsx`

The `n` and `p` keys navigate to next/previous problems. But if a student is typing in the stdin textarea or the discussion form, pressing `n` or `p` will navigate away from the page instead of inserting the character. The `useKeyboardShortcuts` hook does not check whether the active element is an input/textarea.

**Recommendation**: Guard the shortcut handler with a check like `if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;`

### 4. Unsaved changes guard warning message is hardcoded in English

**File**: `src/hooks/use-unsaved-changes-guard.ts` (line 6)

```typescript
const DEFAULT_WARNING_MESSAGE = "You have unsaved code changes. Leave this page?";
```

This `window.confirm()` message is never translated. Korean students using the platform in Korean will see an English browser dialog when they try to navigate away from an edited problem. The `warningMessage` parameter exists but is never passed a translated value from `ProblemSubmissionForm`.

**Recommendation**: Pass the translated warning message from the component that uses the hook.

### 5. No "are you sure?" when the exam timer expires and auto-submits

**File**: `src/components/exam/countdown-timer.tsx`

When the countdown reaches zero, `onExpired` fires silently. There is no visible "Time's up! Your work has been submitted." message or redirect. The student just sees `00:00:00` in red and has to figure out what happened. The `onExpired` callback is optional and not always wired up to an auto-submit flow.

**Recommendation**: When the timer expires, show a prominent modal/dialog explaining that time is up and what happens next (auto-submission of latest code, etc.).

---

## Minor Issues

### 6. Run result is ephemeral -- no history

When a student clicks "Run" to test their code, the result appears below the editor but disappears if they navigate away and come back, or if they click "Run" again. There is no run history. During debugging, students often need to compare outputs across multiple runs.

**Recommendation**: Keep a small run history (last 3-5 runs) or at least preserve the last run result in the component state across tab switches.

### 7. Code editor fullscreen lacks a visible keyboard hint

**File**: `src/components/code/code-editor.tsx`

The fullscreen button shows a tiny "F" label but the actual shortcut is not `F` -- it requires clicking the button. The label is misleading. Also, there is no `F11` or standard fullscreen shortcut support.

### 8. Submission status tooltip is hover-only (not touch-friendly)

**File**: `src/components/submission-status-badge.tsx`

The detailed status tooltip (showing execution time, memory, failed test case) only appears on hover via the `Tooltip` component. On mobile/touch devices, tooltips are unreliable -- students cannot see the detailed verdict information without tapping, and even then it may not work consistently.

**Recommendation**: On touch devices, show the detail information inline or make the badge tappable to expand details.

### 9. Problem description rendering does not indicate sample I/O boundaries clearly

**File**: `src/components/problem/structured-problem-statement.tsx`

The structured problem statement parser separates blocks by type (markdown, input, output, etc.), but there is no visual separator or copy button for sample input/output blocks. Students often need to copy sample input to test against their code.

**Recommendation**: Add a "Copy" button on sample input/output blocks.

### 10. The leaderboard table is horizontally scrollable but has no scroll indicator

**File**: `src/components/contest/leaderboard-table.tsx`

The leaderboard uses sticky columns (rank, name) with horizontal overflow for problem columns. On mobile or narrow screens, there is no visual indicator that the table scrolls horizontally. Students may not realize there are more problems to the right.

**Recommendation**: Add a subtle fade or scroll hint on the right edge when there is overflow content.

### 11. Contest join redirects to dashboard, not the contest page

**File**: `src/app/(public)/contests/join/contest-join-client.tsx` (line 65)

After successfully joining a contest via access code, the student is redirected to `/dashboard/contests/{id}` (the dashboard view) rather than `/contests/{id}` (the public contest page). This is confusing because the student was on the public-facing join page and expects to see the contest they just joined.

### 12. Exam start confirmation dialog uses `render` prop pattern

**File**: `src/components/exam/start-exam-button.tsx` (line 65)

```tsx
<DialogTrigger render={<Button size="lg">{t("examStartButton")}</Button>} />
```

The `render` prop on `DialogTrigger` is a Base UI pattern that may confuse students using screen readers -- the button semantics may not be properly conveyed. This should be tested with a screen reader.

### 13. Profile page shows read-only fields that look editable

**File**: `src/app/(dashboard)/dashboard/profile/page.tsx`

The userId, username, email, and className fields are rendered as `<Input>` elements with `readOnly disabled`. They look like form fields but cannot be edited. This is confusing -- students may try to click them and wonder why they cannot edit their email.

**Recommendation**: Display these as plain text or styled differently from editable fields.

### 14. Anti-cheat privacy notice cannot be dismissed by keyboard alone

**File**: `src/components/exam/anti-cheat-monitor.tsx` (lines 274-299)

The privacy notice dialog has `disablePointerDismissal` set, which prevents closing via click-outside. The "Accept" button is the only way to dismiss it. However, pressing Escape also does not close it (which is correct for anti-cheat), but there is no keyboard focus management to guide the student to the Accept button. The dialog does focus the first element, but if the student tabs past the button, they may get stuck.

### 15. Diff view for wrong answers is only available for visible test cases

**File**: `src/app/(public)/submissions/[id]/page.tsx` (lines 133-135)

Expected output is only shown for visible test cases when the answer is wrong. If the problem has no visible test cases (all hidden), the student gets "Wrong Answer" with no diff information at all. This is common in competitive programming where all test cases are hidden.

### 16. Source code file upload has no file size warning

**File**: `src/components/problem/problem-submission-form.tsx` (lines 214-230)

The "Upload Source File" button accepts any file without checking the file size before reading it. A student accidentally uploading a large binary file could cause the browser to hang while calling `selectedFile.text()`.

---

## Accessibility Observations

### 17. Skip-to-content link is implemented correctly

**File**: `src/components/layout/skip-to-content.tsx` -- The skip link uses `sr-only focus:not-sr-only` pattern, which is correct.

### 18. ARIA roles and live regions are well-implemented in the countdown timer

**File**: `src/components/exam/countdown-timer.tsx` -- Uses `role="timer"`, `aria-live` regions for threshold announcements, and `aria-live="assertive"` for the 1-minute warning. This is good accessibility practice.

### 19. Mobile navigation has focus trap and keyboard support

**File**: `src/components/layout/public-header.tsx` -- The mobile menu implements focus trapping with Tab/Shift+Tab wraparound and Escape-to-close. This is solid accessibility work.

### 20. Problem progress icons use `sr-only` text for screen readers

**File**: `src/components/assignment/assignment-overview.tsx` (lines 77-109) -- Progress icons (solved/attempted/untried) include `<span className="sr-only">` labels. Good.

### 21. Some form labels lack explicit `htmlFor` associations

The difficulty range filter, tag filter, and sort dropdown in the practice page use `<label>` elements without `htmlFor` attributes pointing to the corresponding form controls (they rely on the `FilterSelect` component which may or may not handle this internally).

---

## i18n Observations

### 22. Translations are comprehensive and well-structured

Both `en.json` and `ko.json` are 3141 lines each, suggesting thorough translation coverage. The i18n system uses `next-intl` with proper locale detection (cookie, Accept-Language header, system settings fallback).

### 23. Korean letter spacing is properly handled

Multiple files contain conditional logic like `locale !== "ko" ? " tracking-tight" : ""` to avoid applying Latin tracking to Korean text. This is thoughtful.

### 24. Language selector categories are English-only

**File**: `src/components/language-selector.tsx` (lines 12-27)

Category names like "C / C++", "Java / JVM", "Python" etc. are hardcoded in English. While these are programming language names (arguably language-neutral), the "Other" category label is translated, creating an inconsistency.

### 25. Runtime error labels are hardcoded in English

**File**: `src/components/submission-status-badge.tsx` (lines 51-57)

```typescript
const RUNTIME_ERROR_LABELS: Record<string, string> = {
  SIGSEGV: "Segmentation fault",
  SIGFPE: "Division by zero",
  // ...
};
```

These are displayed in tooltips but are never translated.

---

## Suggestions for Improvement

1. **Submission queue position feedback**: The submission detail page polls for queue position (`/queue-status`), which is great. Consider showing a progress bar or estimated wait time rather than just a number.

2. **Code snapshot recovery**: The automatic code snapshot feature (every 10-60 seconds during assignments) is excellent for crash recovery. Consider surfacing this to students -- "Your code was auto-saved at 14:32" -- so they know their work is protected.

3. **Problem difficulty visualization**: The tier badge system (`TierBadge`) is a nice touch. Consider adding a color-coded difficulty bar or chart on the practice page to help students quickly gauge difficulty distribution.

4. **Contest replay**: The contest replay feature (`ContestReplay`) for expired contests is a standout feature. Consider making it available during live contests (with a delay) so students can see how they are performing relative to others in real-time.

5. **Editor font size control**: The profile page allows setting `editorFontSize` and `editorFontFamily`. Consider adding a quick-access control directly in the code editor (like VS Code's Ctrl+/- zoom) so students do not have to go to their profile to adjust font size during an exam.

6. **Offline resilience during exams**: The anti-cheat system already handles offline events (`handleOnline`). Consider adding a local code persistence mechanism that survives a full page refresh during exams, so students do not lose work if the browser crashes.

7. **Submission "Resubmit" button**: The submission detail page has a "Resubmit" button that navigates back to the problem with the code pre-filled via localStorage. This is a great UX pattern. Consider adding a "Resubmit with same language" shortcut.

8. **Contest clarifications are well-implemented**: The clarification system with public/private visibility, quick yes/no answers, and polling refresh is solid. Consider adding a notification when a clarification is answered.

---

## Overall Grade: B+

**Strengths**: The platform has a well-thought-out exam system with proper anti-cheat, server-time-synced countdown timers, code draft persistence, keyboard navigation, comprehensive i18n (Korean support is not an afterthought), and strong accessibility fundamentals (skip links, ARIA live regions, focus management). The leaderboard with frozen rank display, ICPC/IOI scoring models, and contest replay are features that rival commercial platforms.

**Weaknesses**: The mobile experience for the problem list is the biggest gap. The 4-second submit delay, untranslated runtime error labels, and the keyboard shortcut conflict with text inputs are the most impactful issues for daily student use. The exam expiry flow needs a clearer end-state communication.

The platform is clearly built by someone who understands competitive programming workflows. With polish on the mobile experience and the exam edge cases, this would be an A-tier educational judge.