# JudgeKit Student Experience Review

**Reviewer persona**: University CS student using this platform for assignments, exams, and contests  
**Date**: 2026-04-20  
**Based on**: Source code review of all student-facing components

---

## 1. Submission Experience

**Overall: Good, with some rough edges**

The submission flow is well-structured. The `ProblemSubmissionForm` component (`src/components/problem/problem-submission-form.tsx`) provides a single, focused panel with language selection, code editor, stdin, and Run/Submit buttons side by side. The Ctrl+Enter shortcut for submit is a must-have and it is there. The `PublicQuickSubmit` component (`src/components/problem/public-quick-submit.tsx`) makes this inline on the problem detail page for logged-in users, which is the right call -- no extra page navigation to submit.

**What works well:**
- File upload button right next to the language selector. If I have code in VS Code already, I can just upload it instead of copy-pasting.
- "Reset to Template" button for when I mess up and want a clean main() skeleton. Smart touch.
- Draft persistence via `useSourceDraft` hook. If I accidentally close the tab, my code is still there when I come back. This has saved me on other platforms and I am glad it exists here.
- Unsaved changes guard (`useUnsavedChangesGuard`) prevents losing code when navigating away.

**Pain points:**
- After submitting, you get redirected to the submission detail page (`router.push(submissionHrefBuilder(submissionId))`). There is no option to stay on the problem page and keep iterating. On competitive programming sites, I typically submit, see the verdict in a sidebar, and immediately keep coding. Here I lose my place every time.
- The stdin panel is collapsed by default (`stdinOpen` starts as `false`). When a problem has specific input format requirements, I have to click to expand it every time. This is fine for simple problems but annoying for problems where I need to test multiple inputs repeatedly.
- The Run button sends to `/api/v1/compiler/run` with `assignmentId` attached but the result display is minimal -- just stdout/stderr in a small box with a 2000-character truncation. No diff against expected output for the sample test cases that are in the problem statement. I have to manually compare, which is tedious.

**Live update system:**
The SSE-based polling system in `useSubmissionPolling` (`src/hooks/use-submission-polling.ts`) is solid. It tries EventSource first, falls back to fetch polling with exponential backoff. The `LiveSubmissionStatus` component shows queue position and grading progress with a progress bar. This is legitimately good -- knowing "3 ahead in queue" or "grading test 5/10" reduces anxiety while waiting. The badge pulses during active states via `showLivePulse`.

One gap: the submission list auto-refresh (`src/components/submission-list-auto-refresh.tsx`) uses `router.refresh()` on a timer -- this is a full server component re-render, not a lightweight client update. On a slow connection during a contest, this could cause visible UI flashes.

---

## 2. Problem Browsing

**Overall: Solid filtering, but the difficulty system is confusing**

The practice page (`src/app/(public)/practice/page.tsx`) is feature-rich:
- Search by number, title, or description content
- Filter by tag, difficulty range, and sort by 5 options
- Progress filter tabs (solved/unsolved/attempted) for logged-in users
- Pagination with page size control

**What works well:**
- The `ProblemProgress` system that shows solved/attempted/untried badges on each problem row. This is essential for tracking what I have done.
- Tag-based filtering with color coding. Clicking a tag in the problem list navigates to a filtered view. Nice cross-linking.
- "Similar Problems" section on the problem detail page (`src/app/(public)/practice/problems/[id]/page.tsx`). After solving a problem, I can find related ones to practice the same concept.

**Pain points:**
- The difficulty system (`src/lib/problem-tiers.ts`) uses decimal numbers like `3.47` mapped to tier names like "Silver V" and "Silver III". As a student, I do not know what "Silver V" means relative to "Silver III" without learning the system. The tiers go Bronze -> Silver -> Gold -> Platinum -> Diamond -> Ruby, but within each tier there are only "V" and "III" sub-tiers. This is less granular than the letter-based system (A-F) most competitive programming sites use, and the labels are less intuitive. I would prefer seeing "Easy / Medium / Hard" or a simple numeric scale.
- The difficulty is displayed as a decimal like `3.47` next to the tier badge. The raw number adds no value for me as a student -- the tier is what matters, and the decimal just looks like noise.
- Progress filtering uses a "Path B" that fetches all problem IDs and user submissions in JavaScript, then paginates client-side. The code even has a comment warning: "For large problem sets (10k+), this should be moved to a SQL CTE." If the problem set grows, this page will get slow.
- No "random unsolved problem" button. When I want to practice, I spend time deciding what to solve instead of just diving in. A "surprise me" feature that picks a random unsolved problem in my difficulty range would be great.

**Problem detail page:**
The tabbed layout (Problem / Editorial / Accepted Solutions / Discussion) is clean. The two-column grid (problem description on left, submission form on right) for logged-in users is excellent -- I can read the problem and code at the same time without scrolling. The sticky submit panel (`className="sticky top-6"`) stays in view as I scroll the problem description.

However, the "Accepted Solutions" tab just shows the component `AcceptedSolutions` without me having to solve the problem first. In a competitive setting, this is like showing the answer key before attempting the problem. There should at least be a warning or a "spoiler" toggle.

---

## 3. Exam Experience

**Overall: Functional but stressful -- could use more student-facing polish**

The exam flow is handled through the group assignment page (`src/app/(dashboard)/dashboard/groups/[id]/assignments/[assignmentId]/page.tsx`). Two modes exist:

- **Scheduled**: Everyone starts and ends at the same time. A `CountdownTimer` shows time remaining.
- **Windowed**: Each student gets a personal timer after clicking "Start Exam". The personal deadline is calculated from `examDurationMinutes`.

**What works well:**
- The `CountdownTimer` component (`src/components/exam/countdown-timer.tsx`) is well-designed. It syncs with the server time via `/api/v1/time` to avoid client clock skew. Color changes as time runs out (green -> secondary -> red). Pulsing animation at 1 minute left. Toast warnings at 15, 5, and 1 minutes. Accessibility via `aria-live="assertive"` for screen readers. This is professional-grade.
- The `StartExamButton` uses a confirmation dialog so I do not accidentally start my exam. Good.
- The `AntiCheatMonitor` (`src/components/exam/anti-cheat-monitor.tsx`) shows a privacy notice before starting monitoring. It tracks tab switches, copy/paste, and right-clicks. The privacy notice lists exactly what is tracked. This transparency is appreciated, even if the monitoring itself is stressful.
- Code snapshots are auto-saved every 10 seconds during exams (`snapshotTimerRef` in `ProblemSubmissionForm`), so if my browser crashes, my work is partially recoverable.

**Pain points:**
- During a windowed exam, the timer is shown at the top of the assignment overview page. But when I click into a specific problem to code, the timer disappears because the problem page (`src/app/(dashboard)/dashboard/problems/[id]/page.tsx`) does not include the `CountdownTimer`. I have no idea how much time is left while I am actually coding. This is a serious problem -- on a timed exam, the countdown must be visible at all times.
- The exam "expired" state just shows a red box saying "Time Expired" but does not clearly tell me whether my in-progress submissions were auto-submitted or lost. This ambiguity is extremely stressful.
- There is no way to see my overall exam progress at a glance (e.g., "3/5 problems attempted, 2 accepted"). I have to look at individual problem statuses in the `AssignmentOverview`. A simple progress bar or checklist would help me prioritize remaining time.
- The anti-cheat `tab_switch` toast warning fires every time I switch tabs. If I am using a reference sheet on another tab (allowed by some instructors), the constant warnings are anxiety-inducing. There is no way for me to know if tab-switching is actually forbidden or just monitored.

---

## 4. Contest Experience

**Overall: Good for ICPC/IOI, missing real-time push**

The contest detail page (`src/app/(dashboard)/dashboard/contests/[assignmentId]/page.tsx`) provides a comprehensive student view with leaderboard, clarifications, and personal submissions.

**What works well:**
- ICPC and IOI scoring models are both supported and clearly labeled with colored badges. The `LeaderboardTable` (`src/components/contest/leaderboard-table.tsx`) renders ICPC cells with +/-attempt notation and penalty, and IOI cells with color-graded scores. Both look correct.
- Frozen leaderboard support with a snowflake icon. If the leaderboard is frozen, students see the frozen state, but the current user's live rank is shown as a small badge. This is a nice touch that reduces the "am I doing okay?" anxiety during a freeze.
- Podium highlighting (gold/silver/bronze row backgrounds and trophy icons) for top 3. Makes the leaderboard feel competitive.
- The current user's row is highlighted with a ring and slight background tint, making it easy to find yourself in a long leaderboard.

**Pain points:**
- The leaderboard refreshes via polling every 30 seconds (`refreshInterval = 30000` in `LeaderboardTable`). This is not real-time. During a fast-paced contest, 30 seconds is an eternity -- other competitors' scores can change significantly between refreshes. WebSocket or SSE push would be much better here.
- Clarifications (`ContestClarifications` component) also poll every 30 seconds. If I ask a clarification and the judge answers, I might not see it for half a minute. During a contest, that is a long wait. There is also no notification (no toast, no badge) when a new clarification answer appears -- I have to keep checking the section.
- The "My Submissions" card on the contest page only shows the last 50 submissions with no pagination. In a long contest with many attempts, I cannot see older submissions.
- No way to filter "My Submissions" by problem or by verdict. If I have 30 submissions and want to find my latest AC on problem C, I have to scan the table manually.
- The contest replay feature (`ContestReplay`) and statistics (`ContestStatistics`) are only shown for expired/closed contests on the public page. Students cannot see their own replay during or after the contest in the dashboard. This is a missed learning opportunity.

---

## 5. Code Editor

**Overall: Competent CodeMirror 6 setup, missing key features**

The editor is built on CodeMirror 6 via the `CodeSurface` component (`src/components/code/code-surface.tsx`), wrapped by `CodeEditor` (`src/components/code/code-editor.tsx`).

**What works well:**
- Two built-in themes: Material Lighter (light) and One Dark (dark), auto-switching with system theme. The Material Lighter syntax highlighting is carefully crafted with specific colors for every token type.
- Smart newline: auto-indents after `{` and `:`, and the electric brace feature auto-dedents when typing `}`. These small things make coding much smoother.
- Custom theme support via `editorTheme` prop and `loadEditorTheme` from `@/lib/code/editor-themes`.
- Fullscreen mode with F key and Esc to exit. Important for coding on a laptop screen.
- Bracket matching built in.
- Language support covers C, C++, Java, Python, JavaScript, TypeScript, Kotlin, C#, Go, Rust, Swift, R, Perl, PHP -- a strong selection. Many use CodeMirror's native language packages; others use `StreamLanguage` for legacy modes.
- iOS Safari handling: `drawSelection()` is disabled on iOS to avoid conflicts with UIKit selection handles. This shows attention to cross-browser issues.

**Pain points:**
- **No autocomplete/intellisense.** There is no `@codemirror/autocomplete` extension loaded. No function name completion, no variable suggestions, no snippet expansion. For a platform where I am writing code from scratch, this is a significant productivity loss compared to VS Code or even LeetCode's editor.
- **No linting or error highlighting.** No `linter` extension or `diagnostic` markers. I do not see squiggly lines for syntax errors until I compile. This means I waste submissions on trivial typos.
- **No code folding.** For longer solutions, I cannot collapse helper functions to focus on the main algorithm.
- **No find/replace.** There is no search panel. If I need to rename a variable across my code, I have to do it manually.
- **No multi-cursor support.** The default keymap does not include multi-cursor bindings.
- For some languages (Verilog, SystemVerilog, VHDL, and many exotic languages like Mercury, Modula-2, SPARK, Curry, Clean, Carp, Idris2, Elm, PureScript, Rescript), the language mapping falls back to `plaintext` or an approximation (e.g., SPARK -> Rust highlighting, PureScript -> Haskell). These languages get no real syntax highlighting. Students using these languages are at a disadvantage visually.
- The `RAW_TEXTAREA_LANGUAGES` set only contains `"whitespace"` -- presumably the Whitespace esoteric language. This means there is exactly one language that degrades to a plain textarea. But given that some `StreamLanguage` modes may have poor quality, there could be more languages where a textarea would actually be better.

---

## 6. Feedback Quality

**Overall: Good when details are shown, frustrating when hidden**

The `SubmissionStatusBadge` component (`src/components/submission-status-badge.tsx`) provides tooltip-based feedback on hover:
- **WA**: Shows "WA on test #N" and score. Critical for debugging.
- **TLE**: Shows execution time vs time limit. Helpful for understanding how close I was.
- **RE**: Translates signal names (`SIGSEGV` -> "Segmentation fault", `SIGFPE` -> "Division by zero"). This is genuinely helpful -- most students do not know signal numbers.
- **CE**: Shows truncated compile output (first 200 chars) in the tooltip.
- All verdicts show execution time and memory usage.

The `SubmissionResultPanel` (`src/app/(dashboard)/dashboard/submissions/[id]/_components/submission-result-panel.tsx`) shows per-test-case results with status, time, and memory. For wrong answer on a visible test case, it shows an `OutputDiffView` with unified and side-by-side diff. The diff view (`src/components/submissions/output-diff-view.tsx`) is clean with line numbers and color-coded additions/removals.

**What works well:**
- The diff view for wrong answers is excellent. Side-by-side comparison with expected vs actual output is exactly what I need to debug a WA.
- Runtime error type translation makes errors approachable.
- Compile output viewer uses the code viewer component with "danger" tone for red highlighting.
- Queue position display and grading progress bar reduce uncertainty during judging.

**Pain points:**
- Feedback visibility is controlled by three per-problem flags: `showDetailedResults`, `showRuntimeErrors`, `showCompileOutput`. When these are `false` (which is the default for many contest problems), I get literally nothing -- just a badge saying "Wrong Answer" with no indication of which test case failed. This is the single most frustrating aspect of any online judge, and JudgeKit does not solve it. I understand the rationale (preventing students from reverse-engineering hidden test cases), but the all-or-nothing approach is demoralizing.
- When `showDetailedResults` is false, the test case results table is replaced with "Detailed results hidden." At minimum, showing the score breakdown (e.g., "4/10 test cases passed") would help me gauge my progress without revealing actual test data.
- The expected output for wrong answers is only shown when `isVisible` is true AND `showDetailedResults` is true AND the status is `wrong_answer`. For time_limit and runtime_error on visible test cases, no expected output is shown even when it exists.
- The `SubmissionStatusBadge` tooltip only appears for terminal statuses with detail data. For active statuses (pending, queued, judging), there is no tooltip at all. I cannot even see "Queued" vs "Judging" without the live status panel.
- The score display rounds to 2 decimal places (`Math.round(score * 100) / 100`). For IOI scoring with partial points, this could hide meaningful differences. A score of 0.005 and 0.004 both display as 0.01 or 0.00, which is misleading.

---

## 7. Community / Discussion

**Overall: Functional but bare-bones**

The community page (`src/app/(public)/community/page.tsx`) provides thread listing with "Newest" and "Popular" sorting, plus a "My Discussions" tab. Per-problem discussions are embedded in the problem detail page tabs.

**What works well:**
- Vote buttons on threads and posts (`DiscussionVoteButtons`). Cannot vote on your own content. Score is displayed.
- "Questions" and "Solutions" split within problem discussions. This separation is useful -- I want to see other people's approaches separately from questions about the problem.
- Editorial tab on problem pages with admin/instructor-created content. Editorials can be voted on too.
- "My Discussions" tab lets me find my own threads quickly.
- Pinned and locked thread support.

**Pain points:**
- No markdown editor for posts. The `DiscussionThreadForm` uses a plain `<Textarea>`. I cannot format code blocks, add bold text, or create links. The `AssistantMarkdown` component renders markdown on the read side, but the write side has no preview or formatting help. For a programming community, this is a significant gap. My code pastes will lose formatting.
- No @mention or notification system. If someone replies to my thread, I have no way to know unless I check back manually.
- No search within discussions. I can search the community page threads by sorting, but I cannot search for a specific topic or error message across all threads.
- No code block support in the post form. If I want to share a solution snippet, I have to use raw text that will not be syntax-highlighted.
- The community page shows `authorName` but no avatar or profile link (unlike the `users/[id]` page that exists). Discussions feel impersonal.
- No "mark as answer" or "accepted answer" feature for the Questions tab. On Stack Overflow-style forums, knowing which answer solved the problem is critical.
- Thread replies (`DiscussionThreadView`) show flat lists with no threading/nesting. Long discussions become hard to follow.

---

## 8. Mobile Experience

**Overall: Desktop-first, mobile is an afterthought**

The `useIsMobile` hook (`src/hooks/use-mobile.ts`) uses a 768px breakpoint. The `PublicQuickSubmit` component switches between `Dialog` and `Sheet` (bottom sheet) based on mobile detection. This is a good pattern.

**What works well:**
- The bottom sheet submission form on mobile (`SheetContent side="bottom"`) is a thoughtful touch. Full-screen dialog modals are awful on mobile.
- The problem detail page uses `grid grid-cols-1 gap-6 lg:grid-cols-2` -- single column on mobile, two columns on desktop. The responsive grid is correct.
- The practice page filter form uses `flex-col gap-4 md:flex-row` for the search/filter row.

**Pain points:**
- The code editor on mobile is essentially unusable. The `CodeSurface` component loads CodeMirror 6 with `drawSelection()` disabled on iOS (good), but there is no mobile-specific keyboard handling, no touch-friendly toolbar for common operations (tab, indent, parentheses), and the 300px minimum height wastes screen space on a phone. Typing code on a virtual keyboard without autocomplete is painful.
- The leaderboard table on mobile will require horizontal scrolling (`overflow-x-auto` is set). A table with rank, name, solved count, penalty, and per-problem columns is way too wide for a phone screen. There is no card-based alternative layout.
- The contest clarifications page uses a `<select>` dropdown and `<Textarea>` with no mobile-specific styling. On small screens, the form elements may be hard to interact with.
- The practice page filter form requires a page reload (it is a `<form method="get">`), losing scroll position and any unsaved state. On a slow mobile connection, this is a poor experience.
- No bottom navigation bar for mobile. The main navigation is in the sidebar, which requires a hamburger menu tap every time. For a platform I check between classes on my phone, a persistent bottom tab bar (Practice / Contests / Playground) would be much faster.
- The submission detail page shows source code in a `CodeViewer` with no line wrapping by default. On a narrow screen, long lines require horizontal scrolling.

---

## 9. Playground

**Overall: The best feature for quick testing**

The playground page (`src/app/(public)/playground/page.tsx`) uses the `CompilerClient` component (`src/components/code/compiler-client.tsx`).

**What works well:**
- Language selection with default code templates for C, C++, Java, Python, JavaScript, Rust, and Go. Each template is a working "read two numbers, print their sum" program. This is perfect for quickly testing a language I am rusty in.
- Multiple test cases with add/remove tabs. I can create TC1, TC2, TC3 with different inputs and run them independently. This is more powerful than most online compiler UIs.
- Ctrl/Cmd+Enter to run. Consistent with the submission form.
- Output truncation with "Show full output" button for large outputs. Prevents the page from freezing on infinite-loop programs.
- Auto-tabs to the most relevant output (compile errors first, then stderr, then stdout).
- Language preference persists in localStorage.

**Pain points:**
- The playground runs code via `/api/v1/playground/run`, which likely has stricter resource limits than the judge. I cannot test whether my solution will pass the time limit here.
- No stdin pipe from the problem statement. If I am working on a problem and want to test in the playground, I have to manually copy the sample inputs. A "try in playground" link exists on the problem detail page, but it navigates away from the problem and does not carry over the sample test cases.
- No way to save/share playground snippets. If I write a useful helper function, I cannot bookmark it or share it with a study group.
- The playground is blocked in recruiting mode (`restrictStandaloneCompiler`). If I am a candidate, I cannot use it at all, even for interview prep.
- No dark/light theme toggle specific to the playground. It follows the system theme, which is fine, but the editor area and the output area can feel visually disconnected.
- The test case tab names default to "TC 1", "TC 2" etc. I cannot rename them to something meaningful like "empty input" or "max size" to remember which is which. Actually, looking closer, there IS a name input field per test case. But it is small and easy to miss.

---

## 10. Pain Points Summary

### Critical frustrations (things that would make me switch platforms)

1. **No timer visibility during exam problem solving.** The countdown disappears when I navigate to a problem. This is the kind of thing that causes actual exam disasters.

2. **No autocomplete or error highlighting in the code editor.** Every other modern coding platform (LeetCode, Codeforces, AtCoder with external editors) has some form of intelligent assistance. Writing raw code with zero feedback until compilation is a 2010-era experience.

3. **All-or-nothing feedback visibility.** Getting "Wrong Answer" with zero indication of what went wrong is the worst part of online judges. JudgeKit has the infrastructure for partial feedback (diff views, per-test-case results) but it is gated behind per-problem flags that default to hidden.

### Significant annoyances (things that waste my time daily)

4. **No way to stay on the problem page after submitting.** I lose my place, my scroll position, and my mental flow every time I submit.

5. **Leaderboard and clarifications are polling-based, not real-time.** During a fast contest, 30-second refresh intervals feel sluggish.

6. **No notification when a clarification is answered.** I have to keep manually checking.

7. **Discussion posts have no markdown editor or code formatting.** For a programming community, this is a basic expectation.

8. **No "random unsolved problem" or recommendation engine.** Deciding what to practice next is a chore.

9. **Difficulty tier system (Bronze V, Silver III, etc.) is non-standard and confusing.** Most students are familiar with A-F or Easy/Medium/Hard.

10. **Mobile experience is desktop-first.** The code editor and leaderboard are essentially unusable on a phone.

### Nice-to-haves that would differentiate JudgeKit

11. Problem recommendation based on my solve history and weak areas.
12. Contest replay available to students after the contest ends (not just on the public page).
13. Notification system for discussion replies and clarification answers.
14. Dark mode toggle in the editor (system-follows only, no manual override visible).
15. Keyboard navigation between problems in a contest (the `ProblemKeyboardNav` exists for practice but not for contests).

---

## What JudgeKit Gets Right

It is not all complaints. Some things are genuinely better than other platforms I have used:

- **SSE with fetch fallback for live submission updates.** Most platforms either use long-polling or make you refresh. The progress bar showing "grading test 5/10" is a real anxiety reducer.
- **Side-by-side diff view for wrong answers.** When I can see expected vs actual output with line-level highlighting, debugging becomes much faster. Not all judges offer this.
- **Two-column problem + editor layout.** Being able to read the problem and code simultaneously without scrolling is a huge quality-of-life improvement. The sticky submit panel is the cherry on top.
- **Draft persistence and unsaved changes guard.** These are table stakes for any platform where you write code, but many judges still do not have them.
- **Both ICPC and IOI scoring models.** Supporting both competition formats correctly is non-trivial and JudgeKit handles the leaderboard rendering properly for each.
- **Code snapshots during exams.** If my browser crashes, I do not lose everything. This has saved me on other platforms.
- **Privacy notice before anti-cheat monitoring.** Transparency about what data is collected is legally and ethically important, and the notice lists specifics.

---

*This review is based on source code analysis of the student-facing components as of 2026-04-20. All file paths referenced are in `/Users/hletrd/flash-shared/judgekit/src/`.*
