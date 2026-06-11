# JudgeKit Student Perspective Review

**Reviewer**: Student persona (coursework, exams, contests)
**Date**: 2026-04-17 (Post-Plan-008)
**Codebase**: /Users/hletrd/flash-shared/judgekit

---

## 1. Code Submission Experience — 8/10

**What works well:**

The submission flow is polished. `ProblemSubmissionForm` (`src/components/problem/problem-submission-form.tsx`) provides a clean two-column layout: problem statement on the left, code editor on the right. Draft persistence via `useSourceDraft` (localStorage, 7-day TTL, debounced at 500ms, flushes on pagehide/visibilitychange) means you won't lose code if you navigate away. `useUnsavedChangesGuard` warns before leaving with unsaved work.

Real-time feedback is strong. `useSubmissionPolling` attempts SSE first, falls back to fetch polling with exponential backoff. The `LiveSubmissionStatus` component shows queue position, judging progress with a progress bar (e.g., "3/10" test cases), and `SubmissionListAutoRefresh` auto-refreshes at 3s intervals.

The "Run" button with collapsible stdin is a nice touch — you can test code before submitting without leaving the page. Output truncation at 2000 chars with "Show more/less" toggle keeps the UI clean for long outputs. The submission success toast provides immediate feedback.

**What needs work:**

- **No submission confirmation step.** Clicking "Submit" immediately POSTs. A student could accidentally submit an unfinished solution. No undo.
- **Ctrl+Enter shortcut says "Ctrl+Enter" on Mac.** Should detect platform and show Cmd+Enter on macOS. A Mac user pressing Ctrl+Enter does nothing — they must discover Cmd+Enter by trial and error.
- **Error translation is fragile.** `translateSubmissionError` constructs i18n keys from raw error strings. If the server returns an unmapped error, the fallback is generic with no useful context.
- **Run output truncation shows no total size.** "Show more" reveals the full output, but a student debugging large outputs has no idea how much was truncated. Should show "Showing 2000 of 15000 characters".
- **No rate limiting guard on Run button.** A student could spam "Run" rapidly. The button disables while running, but there is no client-side cooldown after a result returns.
- **Code snapshots are invisible to students.** The snapshot feature silently POSTs to `/api/v1/code-snapshots` every 10-60s during assignments with no student-facing UI. This is purely surveillance — students have zero visibility into what's being collected.

---

## 2. Problem Solving UX — 7.5/10

**What works well:**

The problem list page is feature-rich: search, filter by progress (solved/attempted/unsolved), filter by visibility and tags. Tags are clickable with color-coded badges. Progress tracking clearly shows solved (green check), attempted (status badge), or untried (dashed circle). Quick stats (solved/attempted/untried counts) are now shown.

The practice mode (`/practice/problems/[id]`) is excellent: problem statistics, similar problems by shared tags, previous/next navigation, keyboard shortcuts, and tabbed access to editorials, accepted solutions, discussion, and your own submissions. KaTeX math rendering now works in problem descriptions via `remark-math` + `rehype-katex`.

Problem statements render via `ProblemDescription` with `react-markdown`, `rehype-highlight`, `remark-gfm`, `remark-breaks`. Legacy HTML descriptions are sanitized with DOMPurify. `StructuredProblemStatement` parses blocks into separate cards for long statements.

**What needs work:**

- **Performance problem with progress filtering.** When a progress filter is active, ALL accessible problem IDs are fetched, then ALL user submissions are loaded into memory, and the intersection is computed in JavaScript. With hundreds of problems and thousands of submissions, this is O(n*m) that should be a SQL query.
- **10-column table on problems page is unusable on mobile.** Horizontal scrolling of a wide table is a poor experience. Columns like "visibility" and "difficulty" are unnecessary for students. No card-based mobile view alternative.
- **Practice page and dashboard problems page duplicate logic.** Nearly identical filtering, pagination, and progress-tracking code. This will diverge over time.
- **Difficulty is a raw decimal with no explanation.** A student sees "3.75" with no legend. The tier system exists (`getProblemTierInfo`) and is used in the practice view, but not in the dashboard list.
- **No bookmark/favorite mechanism** for problems you want to revisit.
- **No link from dashboard problems to the richer practice view.** The practice page lives under `/practice/problems/[id]` while the dashboard links to `/dashboard/problems/[id]`. These are separate code paths with different feature sets.

---

## 3. Contest Experience — 8/10

**What works well:**

`CountdownTimer` uses server time synchronization (fetches `/api/v1/time` to compute offset) — good for preventing local clock skew. Threshold warnings at 15min, 5min, 1min via toast and `aria-live="assertive"` for screen readers. Color transitions (green → yellow → red) and pulsing animation when time is low are effective.

Contest join flow strips the access code from the URL to prevent browser history leakage. Windowed exam mode with personal countdown timers and a confirmation dialog before starting is well-implemented. Anti-cheat monitor with privacy notice is present.

**What needs work:**

- **Start Exam button gives no warning about tab-switching penalties.** Students click "Start" without understanding that the anti-cheat monitor will track visibility changes. The privacy notice only appears after the exam starts.
- **Student "My Submissions" table limits to 50 submissions with no pagination.** For active contests with many attempts, older submissions are silently truncated.
- **Contest join error handling is generic.** All errors produce the same "joinFailed" toast. If the code is expired, already used, or the contest is full, the student gets the same unhelpful message.
- **No countdown timer in contest list for active contests approaching deadline** when there is only a startsAt with no deadline set.
- **Contest detail page for students is a monolithic component** mixing upcoming/active/past states with inline conditionals. When upcoming, students see only "contest not started" with no way to view the problem list.

---

## 4. Assignment Experience — 7/10

**What works well:**

Deadline displayed with both absolute time and relative countdown. Late deadline and penalty are clearly shown. Submission blocking after deadline with a clear amber banner. Mobile status board now has card-based view with collapsible details. Score override dialog exists for instructors.

**What needs work:**

- **Assignment selection UX is confusing.** When a problem is in multiple assignments, the student sees "choose assignment" buttons but no explanation of why. The flow is: see problem, see "choose assignment" prompt, click a button, get redirected back to the same page with `?assignmentId=...`, and only then see the submission form. Disorienting.
- **No submission count or rate limit feedback.** Students in contests cannot see how many submissions they have remaining or how frequently they can submit.
- **Score display confusion.** Some places use `formatScore`, others use `Math.round(sub.score * 100) / 100`. Inconsistent.
- **CandidateDashboard is minimal** — three stat cards and a flat list of 5 recent submissions. No links to specific assignments or contests, no progress tracking.

---

## 5. Code Editor — 7/10

**What works well:**

CodeMirror-based editor with syntax highlighting for 15+ languages, bracket matching, smart auto-indent. Fullscreen mode with Escape key to exit. Language selector is searchable with categories and recently-used preference. iOS Safari compatibility via `drawSelection()` disable. Line wrapping toggle now available (though not in the UI). Custom editor themes supported.

**What needs work:**

- **No autocomplete, linting, or code completion.** The editor is bare-bones CodeMirror. Students from VS Code will find it primitive.
- **Line wrapping toggle has no UI control.** The prop exists but students cannot toggle it from the interface.
- **Fullscreen "F" label is misleading.** Pressing "F" does not trigger fullscreen — only clicking the button works. The title says "Fullscreen (F)" but this is false.
- **No font size control.** The `fontSize` prop exists on CodeSurface but is not exposed in any student-facing UI. Students with vision difficulties must use browser zoom.
- **Language selector has no keyboard shortcut.** Must mouse-click to change languages.
- **File upload has no file type filter.** Students could upload binary files producing cryptic server errors.

---

## 6. Mobile Responsiveness — 6/10

**What works well:**

`PublicQuickSubmit` correctly uses `useIsMobile()` to switch between Dialog (desktop) and Sheet (mobile bottom drawer). Responsive flex layouts throughout. Problem detail page collapses from 2-column to 1-column on mobile. Status board has mobile card view.

**What needs work:**

- **Sticky code panel is harmful on mobile.** `sticky top-6` on the code editor prevents scrolling to the submission form or run results on single-column mobile layout.
- **Tables throughout use `overflow-x-auto`** — horizontal scrolling of wide tables is a poor mobile experience. No card-based mobile alternatives for problems/submissions lists.
- **Side-by-side diff view uses `grid-cols-2`** which is unreadable on phones under 375px. No fallback to unified diff on mobile.
- **Language selector combobox popup** does not handle mobile virtual keyboards well. The popup may be pushed off-screen or obscured.
- **Contest detail page has no mobile-specific layout.** The badge-heavy header wraps awkwardly on narrow screens.

---

## 7. Error Handling — 5.5/10

**What works well:**

Error boundary pages exist at both the dashboard and problem level, with "Try Again" and "Back to Dashboard" buttons. Not-found pages provide clear navigation back.

**What needs work:**

- **Error pages log to console only.** No error reporting service integration. Students encountering errors have no way to report them, and developers have no production visibility.
- **No retry with backoff for network failures during submission.** If the POST fails due to a network blip, the student sees a generic toast and must manually resubmit.
- **Polling errors are passive.** When fetch polling fails, a "Live updates delayed" message appears with a retry button. If the error persists, the student sees this warning indefinitely with no escalation.
- **Assignment submission validation failures silently redirect.** If validation fails (e.g., deadline passed between page load and submit), the student is redirected with no explanation.
- **No offline detection or guidance.** If a student loses network connectivity, there is no visual indicator. The app silently fails on API calls with generic error toasts.

---

## Summary Scorecard

| Area | Score | Key Issue |
|---|---|---|
| Submission Flow | 8/10 | No confirmation step, Mac shortcut wrong |
| Problem Solving | 7.5/10 | Progress filter performance, mobile table UX |
| Contest Experience | 8/10 | No tab-switch warning, truncated submissions |
| Assignment Experience | 7/10 | Confusing assignment selection flow |
| Code Editor | 7/10 | No autocomplete, misleading F shortcut |
| Mobile | 6/10 | Sticky panel harmful, no card views |
| Error Handling | 5.5/10 | No offline detection, silent redirect failures |
| **Overall** | **7.5/10** | Solid contest/submission UX, educational scaffolding thin |
