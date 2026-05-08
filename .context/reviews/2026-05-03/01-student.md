# Student Review — JudgeKit (algo.xylolabs.com) — 2026-05-03

**Reviewer persona:** Undergraduate CS student. Will use this for course assignments, programming exams, contests, and self-practice. Will hit the homepage cold from a Slack link, hate filling out forms, and need real help when WA happens at 3 a.m.
**Method:** Read live probe evidence (`/tmp/judgekit-review/probe-evidence.md`), inspected screenshots, walked the student-facing code paths in `/Users/hletrd/flash-shared/judgekit/src/app/(public)/`, `/Users/hletrd/flash-shared/judgekit/src/app/(dashboard)/dashboard/`, and supporting libraries. Compared against MOSS/Domjudge/Codeforces/HackerRank/BOJ.
**Scope:** Brutal honesty about UX, learning support, fairness, accessibility, and frustration points — no rose-tinted glasses.

## Verdict (1-10) per use case

| Use case | Score | One-line summary |
|---|---|---|
| Practice (self-study) | **6.5/10** | Catalog, filters, and similar-problems are strong; submission feedback is rich; but the public guest experience is broken (B1 404 chrome doubles, B2 playground guest false advertising) and Korean/English is mixed in the same listing. |
| Homework (assignment) | **6/10** | Deadlines, late penalties, and personal countdowns are well-thought; but the "choose assignment" prompt is disorienting, no rate-limit feedback, no explanation of what counts as "submitted at the deadline," and snapshot surveillance is invisible. |
| Exam (windowed/proctored) | **5/10** | Anti-cheat infrastructure is real (heartbeat, tab-switch, copy/paste, code snapshots) and the privacy notice is correct in principle, but the start flow is brittle (no "what happens if I Cmd-Tab?" guidance), there is **no recovery path** if the student accidentally closes the tab, and there is **no exam-mode lockdown UI** beyond a banner. |
| Contest (timed competitive) | **6.5/10** | Server-time-synced countdown is great, leaderboard tab works, freeze-period support exists; but no virtual-contest mode, no public participant list before start, contest-detail page is monolithic, and join errors collapse to a single generic toast. |

**Overall student utility: 6/10.** This is a working OJ that the team can defend in a code review. It is not yet a platform a student would *recommend to a friend who needs to learn to code*. The scaffolding (hints, walkthroughs, mistake-of-the-week, "you got this wrong, here is why and how to fix it") is missing.

## Top 5 things that work well

1. **Server-time-synced countdown timer.** `src/components/exam/countdown-timer.tsx` fetches `/api/v1/time` and computes a clock offset, so a student whose laptop clock is 90 seconds off from the server still sees the truth. This is a real fairness issue at most OJs and JudgeKit handles it correctly. The unit tests at `tests/unit/api/time-route-db-time.test.ts` even pin the contract to the DB clock, not the Node `Date.now()`. That is the right architecture.
2. **Code drafts persisted across navigation.** `src/components/problem/problem-submission-form.tsx:58-67` (`useSourceDraft`) keeps your code in localStorage with a 7-day TTL, and `useUnsavedChangesGuard` warns before navigating away. Most students *will* accidentally close a tab during a contest and the draft survives. This is a tier of polish above what BOJ or Domjudge offer.
3. **Per-language smart templates with template-replacement detection.** `src/lib/judge/code-templates.ts` ships idiomatic, production-quality starter code for 17 languages (C++ uses `ios_base::sync_with_stdio(false); cin.tie(nullptr)`, Python pre-aliases `input = sys.stdin.readline`, Java uses `BufferedReader`, Go uses `bufio.NewWriter` with `defer flush`). Switching language preserves your real code but only swaps templates if the editor still contains the previous template. This is one of the few platform-level features I would actually miss on BOJ.
4. **Detailed verdict feedback with educator toggles.** `src/app/(public)/practice/problems/[id]/page.tsx:670-679` passes `failedTestCaseIndex`, `runtimeErrorType`, `executionTimeMs`, `memoryUsedKb`, `compileOutput` into a single status badge that knows how to render WA-with-case-index, TLE-with-time-vs-limit, RE-with-type, and CE-with-output. The `showDetailedResults` / `showRuntimeErrors` / `showCompileOutput` toggles let an instructor dial back the feedback for an exam without rewriting the page. That is a thoughtful pedagogy/integrity tradeoff.
5. **Similar-problems recommendation by tag intersection.** `src/app/(public)/practice/problems/[id]/page.tsx:283-303` computes `selectDistinct` problems sharing at least one tag, ordered by sequence number, limited to 5. It is rendered as an actual sidebar on the problem page (visible in `07-problem-valid.png`). BOJ does not have this. Codeforces' "similar problems" is community-curated and stale; JudgeKit's is automatic and live. Real practice value.

## Top 10 student frustrations (severity + concrete fix)

### F1. The 404 page renders the global header twice and the footer twice (HIGH) — probe ID **B1**

**What I see:** Visit `/practice/problems/1` (the URL a student would type if their friend said "try problem 1"). The page renders the public header, then *another* full public header with another navigation bar, then the 404 card, then *another* footer, then *another* footer. Screenshot `05-problem-detail.png` shows it clearly — there are two "JudgeKit" branding bars and two footers stacked.

**Why it matters for a student:** First impression. A recruiter or professor sharing the platform looks unprofessional. Worse: screen readers see two `banner` landmarks and two `contentinfo` landmarks, which is a hard WCAG violation.

**Fix:** The Next.js App Router error boundary in the `(public)` route group is rendering its own layout instead of bare content. Either:
- Move `not-found.tsx` to a sibling of `layout.tsx` so it inherits chrome once, OR
- Remove any `<PublicHeader />`/`<PublicFooter />` from the not-found leaf — the existing global `src/app/not-found.tsx:55-72` already pulls in chrome via the root layout's outer composition, so the inner `(public)` not-found inherits it twice.

`/Users/hletrd/flash-shared/judgekit/src/app/(public)/layout.tsx:24-36` wraps in `<PublicHeader>` + `<main>` + `<PublicFooter>`. The not-found at `/Users/hletrd/flash-shared/judgekit/src/app/not-found.tsx` likely re-applies a layout. Verify with `grep -n "PublicHeader\|PublicFooter" src/app/not-found.tsx src/app/(public)/not-found.tsx` and consolidate.

### F2. The homepage promises "no sign-in required" for the playground; sign-in is required (HIGH) — probe ID **B2**

**What I see:** Homepage card and `/playground` page both say "Run code with stdin/stdout. Sign in for judged submissions" / "no sign-in required". Reality (per probe-evidence.md): `POST /api/v1/playground/run` requires `auth: { capabilities: ["content.submit_solutions"] }` (`src/app/api/v1/playground/run/route.ts:20`). A guest who clicks "Run" gets 401, with no contextual error, no path forward, and no modal saying "we lied, please sign in." The screenshot at `04-playground.png` is itself the trap: editor loaded, Run button visible, guest about to be rejected.

Worse: the documented but mismatched body shape (`{language, code, stdin}`) returns **HTTP 500** (Zod parse failure) instead of 400. So a student following an out-of-date doc gets "Internal Server Error."

**Why it matters:** The single most common student onboarding gesture — "let me try writing some code without committing to an account" — is broken. Every CS-101 lecturer who shares this URL with a class will produce 200 confused students.

**Fix:** Either (a) build a true guest playground with a hard rate limit (1 call per IP per 30s, 64KB source max, no DB writes, no submission record); or (b) edit the marketing copy in `src/app/(public)/_components/public-home-page.tsx` and `src/app/(public)/playground/page.tsx`'s `tShell("playground.liveDescription")` to remove the "no sign-in required" language. Also fix the Zod failure mode at `src/app/api/v1/playground/run/route.ts` to return 400 with field path instead of 500. The `createApiHandler` in `src/lib/api/handler.ts` should already do this — investigate why it doesn't.

### F3. `/submissions` is in the public top-nav but the page is a sign-in wall (MEDIUM) — probe ID **B4**

**What I see:** The header on every public page lists Practice, Playground, Contests, Rankings, **Submissions**, Community. Click "Submissions" as a guest and you land at `/submissions` with a "Please sign in to view your submissions" empty state and a sign-in button (screenshot `08-submissions.png`, code at `src/app/(public)/submissions/page.tsx:119-135`).

**Why it matters:** This is a navigation lie. The link advertises a public submission feed (à la BOJ "Status" or Codeforces "Status") and delivers a personal-only view. Students will get angry every time they click that nav item not realizing they will hit the wall. It is also a wasted public surface — public submission feeds are valuable for learning ("how did the top scorer solve this?") and for trust ("the judge is actually running, here are the live results").

**Fix:** Either (a) build the public submissions feed (filter by your own with the `scope=mine` toggle that already exists at `src/app/(public)/submissions/page.tsx:151-153`; show others' verdict but hide their source code), or (b) move "Submissions" out of the top nav and into the authenticated dashboard sidebar. Option (a) is the right move — it differentiates JudgeKit from Domjudge and matches what students expect.

### F4. Practice catalog mixes Korean and English when locale=en (MEDIUM) — probe ID **B5**

**What I see:** With locale=en (default), the practice list shows problem titles in Korean (`첫 번째 프로그램`, `Hello World`, `세 수의 합`) and tag chips in Korean (`입출력`). The supporting UI strings (column headers, filter labels) are in English. Screenshot `03-practice.png` confirms.

**Why it matters for a student:** A non-Korean student arriving at the platform via a recruiting link cannot read 90% of the catalog. There is no machine-translation, no "show only English" filter, and no transliteration. The platform's own description claims it is for "programming practice, contests, and coursework" — but it is monolingual de facto.

**Fix:** Three options, in increasing investment:
1. Add a per-locale problem-title column (`title_en`, `title_ko`) and a `language: "en" | "ko"` problem field; let authors author bilingually, store both, render the user's locale.
2. Add a "language preference" filter chip on the practice page that filters by author-claimed language tag, like `src/app/(public)/practice/page.tsx:178-185` already does for tags.
3. Wire up an admin-only "auto-translate via API" pipeline that backfills English titles for existing Korean problems.
At minimum, (2) plus a one-time backfill for the top 50 most-attempted problems would be a 4-hour fix.

### F5. The `Try in playground` deeplink loses problem context (LOW-UX) — probe ID **B6**

**What I see:** `src/app/(public)/practice/problems/[id]/page.tsx:538` sets `playgroundHref={contestlessPlaygroundHref}` which is just `/playground` — no `?problemId=` or `?stdin=` or `?code=` query string. Clicking the button opens the editor with the default `a, b = map(int, input().split())` template and an empty stdin. The button label promises "try this problem in the playground" but there is no problem context preserved.

**Why it matters:** Students click "Try in playground" expecting a fast experimentation lane: pre-loaded with the problem's first sample input, ready to iterate. They get a blank slate. It is faster to copy-paste than to use the button — which means the button is dead weight.

**Fix:** Either deep-link with query params (`/playground?problemId=<id>&stdin=<base64>&template=<lang>`) and have the playground page hydrate from them, or rename the button to "Open empty playground" so it stops over-promising.

### F6. Rankings exposes the literal `admin` user as "Super Admin" to anonymous internet (MEDIUM) — probe ID **B3**

**What I see:** `/rankings` shows a public table where the row for the `admin` user shows their `name` field as "Super Admin" with a "Diamond" tier badge. This is not just informational — it tells any drive-by attacker "the username `admin` exists, has solved enough problems to hit Diamond, and is the actual super-admin role-name on this deployment." `src/app/(public)/rankings/page.tsx:191` orders by `solvedCount DESC` so a staff account with high test-volume floats to the top.

**Why it matters for a student:** Less directly than for security. But for a recruiting platform, having a "Super Admin" be the highest-ranked solver tells candidates "the rankings are not real competition, the admin gamed them or seeded them." Trust signal goes negative.

**Fix:** `src/app/(public)/rankings/page.tsx:163-195` — add a filter clause to exclude users whose role is `super_admin`, `admin`, or `instructor`. Alternatively, gate `/rankings` behind sign-in entirely. The recruiting-redirect path at `:122-134` already redirects candidates in recruiting mode, but unauthenticated users still see the table.

### F7. The Mac keyboard shortcut shown in the Submit button is wrong (LOW) — persistent

**What I see:** `src/components/problem/problem-submission-form.tsx:375` literally hard-codes `${tCommon("submit")} (Ctrl+Enter)`. On macOS, `Ctrl+Enter` does **not** trigger the submit handler — the editor at `src/components/code/code-editor.tsx` has `onSubmitShortcut` wired up via the editor's keymap which uses `Mod-Enter` (CodeMirror's platform-aware modifier), but the *visible label on the button* still says Ctrl. So a Mac user reads "Ctrl+Enter" → presses Ctrl+Enter inside the editor → CodeMirror translates `Mod` to `Cmd` on Mac → the user hits the literal `Ctrl` modifier → nothing happens.

This was flagged in `01-student.md` (the prior cycle review) and is **still not fixed**.

**Why it matters:** A student on a Mac during a contest will lose 2-3 minutes figuring out why submit is broken, then mouse-click the button. Repeat for every submission of every contest.

**Fix:** Detect platform with `navigator.platform.includes("Mac")` (or use `useIsMac()` hook) and render `(Cmd+Enter)` accordingly. One-line change at `src/components/problem/problem-submission-form.tsx:375`.

### F8. There is no submission confirmation step — accidental submits are permanent (MEDIUM)

**What I see:** Click Submit in `src/components/problem/problem-submission-form.tsx:223-276`. POST goes immediately. The submission is judged, scored, counted in the rate limit, and (in contests) eats a penalty. There is no "Are you sure?" dialog and no "undo within 5 seconds" affordance.

**Why it matters:** I know multiple students who submitted blank or half-finished code by hitting Cmd+Enter while still typing. In ICPC, that is a 20-minute penalty. In a class assignment with limited submissions, that is a wasted attempt. In an exam, that is a real grade hit.

**Fix:** Two options:
1. Add a confirmation dialog when (a) the source is shorter than 50 chars, or (b) it equals the language template, or (c) the user has < 30 seconds since their last submission (likely a misclick).
2. Add a 5-second "Cancel submit" toast after submission posts, similar to Gmail's "Undo Send." Mechanically: hold the submit in a client-side queue for 5s, show a snackbar with "Cancel," fire the actual POST after that window.

### F9. Anti-cheat is invisible to the student — they don't know what's recorded (HIGH-PRIVACY)

**What I see:** `src/components/problem/problem-submission-form.tsx:101-125` runs a snapshot timer in any assignment context. Every 10-60 seconds (depending on activity), the student's current code is POSTed to `/api/v1/code-snapshots`. There is **no UI for this** — no badge, no toast, no entry in their dashboard saying "your code is being snapshotted." The privacy notice in `src/components/exam/anti-cheat-monitor.tsx:274-298` only fires for *exam* mode (windowed contest with `enableAntiCheat=true`); regular assignments snapshot silently.

`src/components/exam/anti-cheat-monitor.tsx` also captures: `tab_switch`, `blur`, `copy`, `paste`, `contextmenu`, `heartbeat` every 30s (`HEARTBEAT_INTERVAL_MS = 30_000`). The snapshot/event distinction is invisible to the student.

**Why it matters:** This is GDPR/PIPA territory. A student in Korea (the deployment's primary audience) has a legal right to know exactly what's being collected and to access/delete it. Courses giving graded assignments need to disclose this in the syllabus. Right now JudgeKit silently surveills regular homework — the student has no idea.

**Fix:**
1. Show the privacy notice modal on **any** assignment with snapshots enabled, not just `enableAntiCheat`.
2. Add a small "Recording" indicator (red dot + "Code snapshots: on") next to the editor when snapshots are active, similar to how Zoom shows the recording indicator.
3. Build `/dashboard/profile/data` showing every event/snapshot the student has produced, with a CSV export, per data-protection law.
4. Document in `docs/exam-integrity-model.md` (which exists, per prompt) what the student-facing disclosure looks like and link from the snapshot UI.

### F10. The submission-form code editor has no autocomplete, snippets, font-size control, or vim/emacs keymaps (MEDIUM)

**What I see:** `src/components/code/code-editor.tsx` is CodeMirror 6 with syntax highlighting and bracket matching. That is it. No language-aware autocomplete (no Pylance, no clangd, no `for(int i=0;i<n;i++)` snippet trigger). No font-size control in the toolbar (the prop exists on `CodeSurface` but is not exposed to the student). No vim/emacs keymap (despite a `vim-scroll-shortcuts.tsx` in `src/components/layout/` that only handles page-level scrolling, not editor command-mode). No mini-map. No problem-side breadcrumb.

**Why it matters:** Students who learn on VS Code (i.e., everyone) feel the regression hard. In a 2-hour exam, the difference between "type `fori` → Tab → for-loop" and typing it out by hand 40 times is real. Vim users (a non-trivial fraction of CS students) will install a userscript to inject vim keybindings — at which point the anti-cheat layer cannot tell userscripts from automation tools.

**Fix:**
1. Add CodeMirror 6's `@codemirror/autocomplete` extension with a small per-language snippet pack (top 10 idioms per language, ~200 LOC total).
2. Expose `fontSize` in the editor settings menu (it already exists in `CodeSurface`).
3. Add an opt-in vim keymap via `@replit/codemirror-vim` (or similar) — keep it off by default. Honest ergonomics buys integrity later (vim users won't sideload anything).

## Path-by-path walkthrough with criticism

### 1. Discovery — landing page → "I want to try a problem"

**Live evidence:** `01-landing.png`, `11-locale-ko.png`. Code: `src/app/(public)/_components/public-home-page.tsx`.

The hero says "Write code. Submit. Get judged in Xylolabs Algo." with a primary CTA "Open dashboard" (white pill, prominent) and a secondary "Sign in." Stats cards show 797 public problems, 6,394 total submissions, 125 supported languages. Judge System card claims "1 worker online, 4 parallel slots."

**What works:**
- Stats are real numbers, not placeholders. That is rare.
- The judge-environment box ("Submissions run in isolated Docker sandboxes") is a trust signal that recruiters notice.
- KO localization is fully translated for the chrome and stats labels (`11-locale-ko.png`).

**What does not work:**
- "Open dashboard" is the primary CTA but a guest cannot open a dashboard — they will hit `/dashboard` → 307 → `/login`. The CTA-to-destination mismatch is exactly the same trap as F2/F3. Fix: if `session?.user == null`, the primary CTA should say "Try a problem" → `/practice` and the secondary should say "Sign in."
- Brand confusion: hero H1 says "Xylolabs Algo," top-left wordmark says "JudgeKit," `<title>` says "JudgeKit," footer says "© 2026 JudgeKit." Pick one. Probe-evidence.md flagged this — still unresolved.
- "Workers online: 1, Parallel slots: 4" is honest but scary. For a course of 200 students hitting submit at the deadline, 4 slots will queue submissions for minutes. There is no client-facing queue-depth indicator. Add one.
- The four section cards at the bottom (Practice / Playground / Contests / Community) duplicate the top nav. Either kill them or upgrade them to teasers (e.g., Practice card shows "Latest problem: Hello World, 12 attempts today").

### 2. First submission — sign-in → profile setup → write code → submit

**Sign in** (`src/app/(auth)/login/page.tsx`, screenshot `02-login-result.png`): Clean, single-card, error message is good ("Invalid username or password" — does not leak whether username exists, which is correct). However: signup is **404'd** in production (per probe-evidence.md), which means there is no path for a student to actually create an account from the public site. This is intentional (`publicSignupEnabled` system setting) but means every student must be invited via instructor or recruiting flow. The login screen should communicate this — "No account? Ask your instructor for an invite link" — instead of just bouncing to a 404 on `/signup`.

**Password rules:** No client-side strength meter visible from screenshots. Server enforces something via `src/lib/auth/` but the rules are not displayed to the user during password change.

**Profile setup:** After first sign-in, students land at `/dashboard` directly. There is no onboarding wizard ("Welcome! Pick your preferred language, set your display name, opt into the leaderboard"). The `editorTheme` and `preferredLanguage` are pulled from `session.user` but there is no UI tour pointing the student to `/dashboard/profile` to set them.

**Language picker:** `src/components/language-selector.tsx` is searchable with categories and a "recently used" affordance. This is good. Default fallback is `"c"` (`src/components/problem/problem-submission-form.tsx:66`) — a strange default for an introductory user. Should be Python or whatever the problem's `defaultLanguage` is.

**Default starter code:** Excellent (see "things that work well" #3). The reset-to-template button at `:299-309` is a thoughtful affordance.

**Editor experience:** See F10. CodeMirror 6 is correctly chosen (faster than Monaco, better mobile support), but feature-thin. No autocomplete, no font-size control in UI, no vim keymap.

**Run vs. Submit:** Two buttons side-by-side at `src/components/problem/problem-submission-form.tsx:362-377`. Run uses `/api/v1/compiler/run`; Submit uses `/api/v1/submissions`. The visual distinction is OK but a new student may not understand the difference. Add a tooltip: "Run = test on your custom input. Submit = judge against all hidden test cases."

**Feedback after submission:** Routed to `/submissions/[id]` via `submissionHrefBuilder` (`:48`). Status polled with `useSubmissionPolling` (SSE → fetch fallback). Verdict surfaces with `SubmissionStatusBadge` showing failed test case index, runtime error type, time vs. limit. This is genuinely good educational feedback — see #4 in "things that work well."

### 3. Failed submission feedback

**The verdict screen** (`src/app/(public)/submissions/[id]/page.tsx`): Renders the source code, the verdict badge with detail, and (if `showDetailedResults` is on) the per-test-case breakdown including a diff view (per prior review note "diff view is recent"). For WA, the failed test case index is shown. For TLE, the actual execution time vs. limit. For RE, the runtime-error type (Segfault, DivByZero, StackOverflow, etc.). For CE, the compiler output.

**What works:** The granularity is right. A student who gets WA on test 7 of 10 knows where to focus. Codeforces shows the same.

**What does not work:**
- **No retry-from-here button.** After WA, the student must navigate back to the problem (or use browser back) to re-edit. There is no "Re-submit with changes" button on the verdict page that prefills the editor with the failed source.
- **No "your previous attempts" summary on the verdict page.** Showing "this is your 4th attempt; previous verdicts were WA, TLE, WA" would be educational. The data is in the DB.
- **Polling errors are passive.** When SSE drops and fetch polling fails, the UI shows a small "Live updates delayed" warning with a retry button. If the worker is dead and the submission is stuck in `judging` for 10 minutes, the student has no way to know whether to wait, refresh, or contact someone. Add a "Submission has been judging for >5min" escalation message with "report stuck submission" button.
- **No retry-with-backoff on initial POST.** If the network blips during submit, the student sees a generic error toast and must manually re-click Submit. Add 3 retries with exponential backoff before showing the error.

### 4. Learning loop

The problem detail page (`src/app/(public)/practice/problems/[id]/page.tsx`) has 4 tabs: Problem, Editorial, Accepted Solutions, Discussion (Questions/Solutions sub-tabs). All exist in code. Visible at `07-problem-valid.png` and `12-problem-ko.png`.

**What works:**
- **Editorials.** Instructor/admin-authored writeups. Renders markdown via `AssistantMarkdown`. Voting buttons on threads. This is a real "post-mortem after you solve it" affordance.
- **Accepted Solutions tab** (`src/components/problem/accepted-solutions.tsx`): can sort by latest/shortest/fastest, filter by language, paginate, optional anonymous mode. This is what BOJ's "맞은 사람 코드" tab is, but cleaner.
- **Similar Problems sidebar.** See #5 in "things that work well."
- **Problem Statistics card.** Total submissions, accepted count, acceptance rate, unique solvers. Plus a "Rankings" button linking to per-problem rankings. Good.
- **Previous/Next navigation with N/P keyboard shortcuts** (`src/app/(public)/practice/problems/[id]/problem-keyboard-nav.tsx`).

**What does not work:**
- **No "hints" tier.** Codeforces and HackerRank both let you reveal hints incrementally (each hint costs partial points, or just consumes a hint quota). Editorials are all-or-nothing — read it and the problem is spoiled. Add hints as a separate first-class entity with progressive disclosure.
- **No streak / progress tracking on the dashboard.** The student dashboard (`src/app/(dashboard)/dashboard/page.tsx`) shows recent submissions but no streak ("you've solved 3 days in a row"), no "problems solved this week," no recommended-next-problem.
- **No "you solved this with help" / "you solved this from a blank slate" distinction.** If the student opened the editorial before solving, the platform does not know. Optionally track this and show on the user profile, like a learner's transparency badge.
- **Editorials are written-content only.** No video walkthrough hooks, no embed support for YouTube/Vimeo, no interactive code-stepping. For visual learners this is a gap.
- **No bookmark/favorite mechanism.** The prior cycle review flagged this. Still missing. Students need a "mark for later" affordance in addition to the auto-tracked attempted/solved status.
- **No "what to learn next" recommender.** The data exists (tags, difficulty, what you've solved). A simple "you solved 3 binary-search problems, try graph BFS next" recommender would be a Saturday-afternoon LOC-100 feature.

### 5. Assignments (homework mode)

**Code path:** `src/lib/assignments/`. UI is folded into the contest page (`src/app/(public)/contests/[id]/page.tsx`) and into the problem detail page when `?assignmentId=` is in the URL.

**What works:**
- **Deadline UI with absolute + relative.** `CountdownTimer` shows both, color-cycles green→yellow→red, pulsing animation in the last minute. Real-time syncs via `/api/v1/time`.
- **Late deadline with penalty.** Both shown explicitly. Good.
- **Submission blocking after deadline.** `assignmentContext.isSubmissionBlocked` (`:201`) checks `effectiveDeadline < now` against the *DB clock* (not the user's clock). This is the correct integrity check. The validation is double-enforced server-side by `validateAssignmentSubmission` (`src/lib/assignments/submissions.ts`).
- **Score override dialog for instructors.** Real feature.

**What does not work:**
- **The "choose assignment" flow is disorienting.** When a problem appears in multiple active assignments, the student lands on the problem page, sees prompts to "choose an assignment" (with no inline explanation of *why* — does it affect grading? deadlines? penalties?), clicks one, gets redirected back to the same URL with `?assignmentId=...` appended, and only then sees the submission form. The first time through, students think the page is broken.
- **No submission count or rate-limit feedback.** Contests with `submissionLimit` enforce a cap, but the UI does not say "you have 3/5 submissions remaining." Students must count manually.
- **Score display is inconsistent.** Some places use `formatScore(sub.score, locale)`, others use `Math.round(sub.score * 100) / 100`, and the prior review flagged this — still inconsistent across `:681` and `:450`.
- **Deadline-boundary semantics are not explained to the student.** What happens if the student clicks Submit at the millisecond the deadline passes? The server uses DB time, the client clock might be ahead, the `validateAssignmentSubmission` will reject with a generic redirect. Add a "Time on server: 23:59:48" tooltip near the countdown to set expectations, and a clearer "Your submission was received 1 second past the deadline" error instead of a silent redirect.
- **No partial credit explanation.** If the student gets 7/10 test cases on an assignment using `points_per_test` scoring, the verdict shows a score but no breakdown of which buckets earned what. The data is there (`failedTestCaseIndex`) but not surfaced.
- **CandidateDashboard is a stub** (per prior review). Three stat cards and 5 recent submissions. No assignment-grade tracking, no per-course grouping, no "due this week" calendar. For coursework this is the highest-friction surface.

### 6. Exams (windowed/proctored mode)

**Code path:** `src/components/exam/`, `src/lib/assignments/exam-sessions.ts`, `src/components/exam/anti-cheat-monitor.tsx` (read in detail above).

**What the student sees on Start Exam:**
1. They land on the problem page with `?assignmentId=...`. If `examMode === "windowed"` and no exam-session row exists, they see "exam not started" with a `StartExamButton` (`:480-485`).
2. Click Start. `enableAntiCheat` is true → `AntiCheatMonitor` mounts → `showPrivacyNotice` is `true` by default → modal opens *over the editor* with the privacy notice (4 bullets: tab switches, copy/paste, IP address, code snapshots) and a single "Accept" button.
3. Until they accept, no events are recorded. After accepting, the heartbeat starts, visibility-change listener attaches, copy/paste/contextmenu listeners attach.

**What works:**
- The privacy notice **is** shown before any data is recorded. `src/components/exam/anti-cheat-monitor.tsx:163-165` gates `flushPendingEvents` on `!showPrivacyNotice`. This is the correct legal sequence.
- The notice modal is non-dismissible — `disablePointerDismissal`, `showCloseButton={false}` (`:276-277`). Good integrity.
- Copy/paste targets are described without text content (`:218-220`: "text content is intentionally NOT captured to avoid storing copyrighted exam problem text"). This is the right balance — the audit log captures *what kind of element* was copied (code editor vs. problem description vs. code block), not the actual text.
- Tab-switch toast (`:196`) gives the student immediate feedback that the platform noticed.

**What does not work:**
- **The privacy notice fires *after* clicking Start, not before.** A student who has not committed yet should see the disclosure first, then click Start. As built, you click Start → realize what you signed up for → cannot back out without losing the exam slot. The notice should be on the Start button itself (or in a confirm-before-start dialog).
- **No "what happens if I Cmd-Tab to look up syntax" guidance.** The 4 privacy notice bullets list *what is recorded* but not *what the consequences are*. Is one tab-switch a soft warning? Three a hard fail? Twenty an automatic zero? The student does not know. Add a "Penalty model" section to the notice.
- **No recovery path from accidental tab close.** If the student accidentally closes the tab during a windowed exam, the local `pendingEvents` in localStorage still flush on next visit (`anti-cheat-storage.ts`), but the *student* sees a generic problem page when they re-open. There is no "you have an exam in progress, here are your remaining minutes, do you want to resume?" landing experience.
- **No proctoring lockdown.** This is "soft" anti-cheat (browser-based). It cannot prevent a student from opening a second laptop, opening their phone, or having a second monitor. For a *real* exam this is fine if the syllabus discloses it; for high-stakes assessment a proper lockdown browser is needed. Document this clearly in `docs/exam-integrity-model.md` so instructors do not over-trust the system.
- **Heartbeat is 30 seconds.** A student with flaky wifi who drops for 90 seconds has 3 missed heartbeats. There is no client-facing "your network blipped, here are your last 3 dropped events" indicator. The student finds out at grade time.
- **Snapshot frequency is invisible.** `src/components/problem/problem-submission-form.tsx:118` snapshots every 10s during active editing, every 60s during idle. The student does not see this cadence anywhere — they cannot tell whether their last 5 minutes of debugging are captured or not.

### 7. Contests

**Code path:** `src/app/(public)/contests/page.tsx`, `src/app/(public)/contests/[id]/page.tsx`, `src/lib/assignments/contests.ts`, `src/lib/assignments/leaderboard.ts`.

**What works:**
- **Contest join flow strips access code from URL** (per prior review). Prevents browser-history leak.
- **Server-time-synced countdown.**
- **Leaderboard with ICPC/IOI scoring.** `LeaderboardTable` component, score timeline chart, freeze-period support (per code search above).
- **Virtual practice exists** in code at `src/app/(public)/contests/[id]/page.tsx:660-661` — though it appears to be post-contest replay rather than true virtual-contest mode (run a past contest with your own start time, treated as new). Worth confirming.
- **Anti-cheat dashboard** exists at the contest level for organizers (`src/components/contest/anti-cheat-dashboard.tsx`).

**What does not work:**
- **Contest-list page is sparse.** Just a list of contests with start/end times and a "join" button. No "registered participants" count, no "duration: 3h, scoring: ICPC" preview, no "you have not joined" badge. Compared to Codeforces' contest list this is barebones.
- **Contest detail page for upcoming contests shows only "not started yet."** Students cannot see the rules, the problem count, the scoring model, the language constraints, or the contest description until it starts. This is hostile to the "should I even register?" decision.
- **Join error handling is single-toast.** `joinFailed` covers expired, already used, contest full, wrong code, etc. Students need specific guidance ("This invite was redeemed by another account; ask your organizer for a new one.")
- **No virtual-contest mode in the strict sense.** Codeforces' virtual contest = "I missed last week's round, run me through it as if I joined live, my time is 0..3h from when I click Start." The current "virtualPractice" flag at `[id]/page.tsx:660` appears to be replay-only, not run-with-your-own-clock. Confirm and document.
- **No real-time leaderboard refresh during contest.** Frozen leaderboards work (per code), but during the live segment the standings update via page refresh, not a live subscription. For competitive watching this is dull.
- **No clarifications/Q&A widget for students during contest.** There is `src/components/contest/contest-clarifications.tsx` and `contest-announcements.tsx`, but it is unclear whether students can *ask* questions or only *see* organizer announcements. Document and surface.

### 8. Mobile / accessibility

**What works:**
- **Skip-to-content link** is the first focusable element (`SkipToContent` in layout). Good a11y baseline.
- **`useIsMobile()` hook** at `src/hooks/use-mobile.ts` switches `PublicQuickSubmit` between Dialog (desktop) and Sheet (mobile bottom drawer) — `src/components/problem/public-quick-submit.tsx:77-94`.
- **Submission list has card-based mobile layout** (`src/app/(public)/submissions/page.tsx:474-517`).
- **Rankings has card-based mobile layout** (`src/app/(public)/rankings/page.tsx:309-335`).
- **Anti-cheat tab-switch warning** uses `aria-live="assertive"` toasts (per countdown-timer review note) — visible to screen readers.
- **`role="list"` on mobile cards** is correctly set.

**What does not work:**
- **Practice catalog table is desktop-only.** `src/app/(public)/_components/public-problem-list.tsx` is a single wide table with `overflow-x-auto`. On a phone it is a horizontal-scroll experience, with key columns (success rate, tags, progress) cut off. Build a card-based mobile alternative similar to the submissions/rankings pattern.
- **Sticky submit panel breaks mobile.** `src/app/(public)/practice/problems/[id]/page.tsx:619` sets `className="sticky top-6"` on the submission card. On a single-column mobile layout, this prevents the user from scrolling to the run-result panel below the editor. Either gate `sticky` on `lg:` breakpoints or remove entirely on mobile.
- **No font-size control.** Students with low vision must use browser zoom, which mangles the table layouts.
- **Color-blind-safe verdict colors.** The submission badges use red/green for accepted/wrong, with no shape or icon distinction. A deuteranope cannot distinguish AC from WA at a glance. Add a check/x icon to the badge or a striped pattern for WA.
- **Focus rings.** Spot-checked via `Button` and `Link` components — focus rings exist (Tailwind defaults), but the contrast ratio of the focus ring vs. the dark theme background is borderline. Test with WCAG 2.5.5 contrast tools.
- **Keyboard navigation on the practice catalog.** Tab order goes through filter controls, then table rows. Each row is not focusable (no `tabindex` on `TableRow`); only the title link is focusable. So a keyboard user can navigate but cannot "select a row" — there is no row-level keyboard activation. Acceptable, but worse than what AG Grid offers.
- **Diff view on mobile.** Per prior review, side-by-side diff uses `grid-cols-2` and is unreadable < 375px. Should fall back to unified diff on mobile.

### 9. Failure modes

**Slow worker queue:** 1 worker, 4 slots = max 4 concurrent submissions. For a class of 200 hitting submit at the deadline, the 200th submission waits in queue for ~4 minutes (assuming 5s avg judging time). The student sees `pending` → `queued` → `judging` → final verdict, with the queue position shown by `LiveSubmissionStatus`. But:
- No "estimated wait: ~3min" displayed.
- No "your submission timestamp is locked at the moment of POST, judging delay won't penalize you" reassurance.

The first one is fixable in ~50 LOC by exposing queue depth from `/api/v1/judge/health`. The second is critical for student trust during a deadline crunch — display it prominently.

**Submission rejected at deadline boundary:** Server-side `validateAssignmentSubmission` checks deadline against DB time. If the student's clock says 23:59:58 but the DB says 00:00:01, the submission is rejected. Currently rejected with a redirect to the contest page (`src/app/(public)/practice/problems/[id]/page.tsx:172-174`). No error toast, no "your submission was 3 seconds late" feedback. Fix: surface the actual reason with a banner on the redirect destination.

**Lost code on tab close:** `useSourceDraft` saves to localStorage on every change (debounced 500ms, flushes on `pagehide`/`visibilitychange`). 7-day TTL. Per `src/hooks/use-source-draft.ts`. This is **good** — most platforms do not do this. But it is silent. Add a "Draft auto-saved 5s ago" indicator near the editor.

**Network drop during exam:** `apiFetch` failures cause `AntiCheatMonitor` to queue events in `pendingEvents` localStorage, retry with exponential backoff (`scheduleRetryRef.current` at `:110-122`, max 3 retries, capped at 30s backoff). When the student comes back online, `handleOnline` listener flushes (`:246-249`). This is correct. But: the student does not see *that* their events were queued. Add a "X events pending sync" indicator.

**Worker crash during contest:** The deployment runs a single worker. If it OOMs, all judging stops. The student sees `judging` indefinitely. There is no admin alert path, no automatic timeout-and-mark-pending after N minutes, no graceful degradation. For a recruiting/exam product this is undersized — at minimum, add a 2nd worker and a stuck-submission timeout (e.g., after 10min in `judging`, re-enqueue or mark `internal_error`).

### 10. i18n

**Locale switcher** (`src/components/layout/locale-switcher.tsx`): Top-right of the public header. Toggles between English and Korean. Persists.

**What's localized:**
- All UI strings (`getTranslations`).
- Date/time formats (`formatDateTimeInTimeZone`).
- Numbers (`formatNumber` with locale).
- Difficulty labels (`formatDifficulty`).
- Status labels (`buildStatusLabels`).

**What's NOT localized:**
- **Problem titles** — stored in a single `title` column, untranslated (B5).
- **Problem descriptions** — same.
- **Tag names** — `problemTags.tag.name` is a string column with no locale variant. So `입출력` shows in both EN and KO views.
- **User display names** — fine, those are user-controlled.
- **Class names / affiliations** — Korean strings in EN view (visible on rankings table per probe-evidence.md).

**Date format consistency:** `formatDateTimeInTimeZone` uses Intl.DateTimeFormat with the request locale. Should produce `2026-05-03 14:30` for ko-KR and `May 3, 2026, 2:30 PM` for en-US. Verify on a date column that this is consistent across pages — I noticed in the screenshots that practice catalog shows `04/05/2026` and `04/22/2026` (US-style) on en — that is correct. KO would show `2026-04-05`. Looks OK.

**Missed:** No way to mark a problem as "this problem is in language X" so students can filter. This is a 1-column DB migration plus a filter chip. Build it.

## Educational scaffolding gaps

This is where JudgeKit is weakest as a learning platform vs. a judging system.

1. **No hints with progressive disclosure.** Editorials are all-or-nothing. A student who is 80% of the way to the solution wants a nudge, not a full walkthrough. Fix: add a `hints` table with N-hint progression, costing partial points or a hint quota.
2. **No mistake-class feedback.** When WA on test 7, the platform says "WA on test 7" but does not say *what kind* of mistake. "Off-by-one in your loop bound?" "Integer overflow?" "Edge case: empty input?" Implementing this requires test-case-level metadata that does not appear to exist. Add a `category` field to test cases ("edge case: empty," "edge case: max N," "general") and surface it.
3. **No "you almost got it" affordance.** If the student passes 9/10 test cases, that is much closer than passing 0/10. The verdict UI does not visually convey "you got 9/10" with a progress bar — it just says WA.
4. **No "code-quality" feedback.** Students who pass with O(n²) when O(n log n) is expected get accepted with no learning. Add an optional "this solution is slower than the editorial — can you improve it?" nudge after AC.
5. **No paired learning resources.** The platform knows a problem uses BFS. There is no "learn BFS" link, no embedded primer, no "watch this 5-minute explainer." Editorials are author-written; for foundational topics the platform should link out to canonical references.
6. **No mistake history per student.** A student who has solved 50 problems has a corpus of mistakes (their WA submissions). Surface "you have 5 unfinished problems where you got close" / "your most common verdict is TLE — try learning about complexity analysis."
7. **No code review on AC submissions.** After AC, "view accepted solutions by others" is great. But there is no automated comparison ("your solution is 50% slower than the median accepted"). The data exists.
8. **No discussion-thread integration with verdict.** When a student gets WA on test 7, they cannot one-click search the discussion forum for "test 7" or "off-by-one." The discussion forum and the verdict screen are siloed.
9. **No "ask the AI" hint button.** This is 2026 — every student expects a "give me a hint" button that calls a model. Either (a) embrace it with rate limits and proper logging for integrity, or (b) explicitly disable it and document why.
10. **No skill tree or mastery model.** The student does not know what they have mastered (recursion? sorting? graph traversal?). A simple per-tag "you have solved 8/12 medium graph problems" mastery indicator on the dashboard would close 80% of this gap.

## Mobile and accessibility issues

(Consolidated from path 8 above.)

**Critical:**
- 404 page renders two `banner` and two `contentinfo` landmarks (B1) — WCAG 1.3.1 violation.
- Verdict colors red/green with no icon/shape redundancy — WCAG 1.4.1 violation.

**High:**
- Practice catalog table is desktop-only horizontal scroll on mobile.
- Sticky submit panel blocks scrolling on mobile.
- Diff view on mobile is unreadable on phones < 375px.

**Medium:**
- No font-size control in the editor UI.
- Focus ring contrast is borderline on dark theme.
- Korean problem titles in default English locale (not strictly an a11y issue but a comprehension barrier).

**Low:**
- No keyboard activation on table rows (only links inside).
- Language selector combobox can be obscured by mobile virtual keyboard (per prior review).
- No "live region" on submission status changes for screen-reader users (the SSE update silently swaps the badge).

## Compared to mainstream OJ platforms

| Feature | Codeforces | Domjudge | BOJ (acmicpc) | HackerRank | LeetCode | JudgeKit |
|---|---|---|---|---|---|---|
| Public catalog | ✓ | ✗ | ✓ | ✓ | ✓ | ✓ |
| Public submission feed | ✓ | ✓ | ✓ | ✗ | ✗ | **✗** (sign-in wall) |
| Per-language smart templates | ✗ | ✗ | ✗ | ✗ | ✓ | **✓** |
| Editor autocomplete | ✓ | ✗ | ✗ | ✓ | ✓ | **✗** |
| Vim/Emacs keymaps | ✗ | ✗ | ✓ | ✗ | ✓ | **✗** |
| Hints (progressive) | ✗ | ✗ | ✗ | ✓ | ✓ | **✗** |
| Editorials | ✓ | ✗ | community | ✓ | ✓ | **✓** |
| Accepted solutions tab | ✗ | ✗ | ✓ | ✗ | ✓ | **✓** |
| Similar problems | ✗ | ✗ | ✗ | ✓ | ✓ | **✓** (auto by tag) |
| Streak tracking | ✗ | ✗ | ✗ | ✓ | ✓ | **✗** |
| Skill tree / mastery | ✗ | ✗ | ✗ | ✓ | ✓ | **✗** |
| Server-time-synced clock | partial | ✓ | ✓ | ✓ | ✓ | **✓** |
| Anti-cheat (tab/copy) | ✗ | ✗ | ✗ | ✓ | ✗ | **✓** |
| Code snapshots | ✗ | ✗ | ✗ | ✓ | ✗ | **✓** |
| Privacy disclosure for proctoring | n/a | n/a | n/a | partial | n/a | **✓** (correct gating) |
| Virtual contest | ✓ | ✗ | ✗ | ✗ | ✗ | partial (replay) |
| Real-time leaderboard | ✓ | ✓ | ✓ | ✓ | ✓ | partial |
| Mobile experience | poor | poor | OK | good | good | **mixed** |
| Korean UI | partial | ✗ | ✓ | ✗ | ✗ | **✓** |
| English UI | ✓ | ✓ | partial | ✓ | ✓ | **✓** (UI only, content not translated) |

**Where JudgeKit beats the field:**
- Smart templates per language with template-replacement detection.
- Auto-similar problems (no community curation needed).
- Server-time-synced countdown done correctly.
- Anti-cheat with proper privacy gating.
- Code drafts with localStorage persistence.
- Detailed verdict feedback with educator-controlled toggles.

**Where JudgeKit is behind:**
- Public submission feed (matters for trust).
- Editor features (autocomplete, vim).
- Hints / scaffolding for learners.
- Mastery / skill tree for student motivation.
- Mobile completeness (catalog table, diff, sticky panel).
- Multi-language content (problem text, tag names).

**The honest summary:** JudgeKit's *judging architecture* is competitive with Codeforces and ahead of Domjudge. JudgeKit's *learning architecture* is behind HackerRank and LeetCode. A student would rate it as "well-engineered backend, half-finished frontend."

## Specific recommended changes ranked by student impact

### P0 — fix today, blocks first impression

1. **Fix the double-chrome 404 (F1, B1).** WCAG violation, looks broken to recruiters. ~30min.
2. **Fix the playground "no sign-in required" claim (F2, B2).** Either build the guest playground or remove the copy. ~1-2 hours for copy fix, ~1 day for guest playground.
3. **Fix the Mac shortcut label (F7).** Detect platform, show correct modifier. ~10min.
4. **Fix the `Try in playground` deeplink (F5, B6).** Either preserve context via query params or rename the button. ~1 hour.

### P1 — fix this sprint, fixes daily friction

5. **Build a public submission feed at `/submissions` for guests (F3).** Show others' verdicts but hide source. Differentiates from Domjudge. ~1-2 days.
6. **Add submission confirmation / undo-send (F8).** 5s cancel toast or short-source/template confirmation dialog. ~half-day.
7. **Make snapshot recording visible (F9).** Indicator in editor, privacy notice for non-exam assignments, data-export endpoint. ~1-2 days for indicator + universal notice; ~3-5 days for full data-export.
8. **Hide staff users from `/rankings` (F6, B3).** One filter clause. ~30min.
9. **Localize problem titles + tags (F4, B5).** DB migration + backfill + filter chip. ~2-3 days for migration; backfill via auto-translate is another 1-2 days.
10. **Onboarding wizard for new users.** Pick preferred language, set display name, opt into rankings, opt into anti-cheat for assignments. ~1 day.

### P2 — fix this quarter, fixes learning experience

11. **Add hints with progressive disclosure.** Schema + UI. ~1 week.
12. **Add streak tracking + dashboard widgets.** "You solved X this week, here's a recommended next problem." ~3-5 days.
13. **Add bookmark/favorite mechanism for problems.** Schema + UI + filter. ~2 days.
14. **Add per-language editor autocomplete with snippet packs.** ~1 week (CodeMirror autocomplete + 17 snippet packs).
15. **Add font-size control in the editor UI.** Prop already exists; expose in settings. ~1 day.
16. **Add card-based mobile view for the practice catalog.** ~2 days.
17. **Build a virtual-contest mode in the strict sense (run a past contest with your own clock).** ~3-5 days.
18. **Add a queue-depth indicator on the submission page.** ~1 day.
19. **Build a recommended-next-problem card on the dashboard.** Tag-based naive recommender. ~2-3 days.
20. **Add color-blind-safe verdict shapes/icons in addition to colors.** ~half-day.

### P3 — strategic, fixes the platform's learning identity

21. **Build a skill tree / mastery model.** Per-tag, per-difficulty mastery indicators on the user profile. ~2-3 weeks.
22. **Add mistake-class metadata to test cases.** Requires authoring discipline; UI is ~1 week.
23. **Add a "code review on AC" comparator.** Show how your accepted solution compares to median speed/length. ~1 week.
24. **Add an opt-in vim keymap.** Done well, this neutralizes the "userscripts vs. integrity" tension. ~3-5 days.
25. **Build a proper data-export and data-deletion flow for anti-cheat data.** Required by GDPR/PIPA for any platform serving Korean users. ~1-2 weeks.

## Final word

JudgeKit is a competently built judging platform with one of the better backends I've reviewed. The judging architecture, the anti-cheat data flow, the server-time-synced countdown, and the per-language template system show real care.

But as a *student-facing* product in May 2026, it has too many small lies (B1 / B2 / B4 / F2 / F7) for a recruiter or instructor to recommend without disclaimers. And as a *learning* product, it is missing the entire mid-layer — hints, scaffolding, mastery, mistake-class feedback — that would turn a judging system into a learning system.

The good news: every P0 fix is < 1 day. The P1 set is < 2 weeks. After that, JudgeKit is a defensible "BOJ + Codeforces + soft anti-cheat" alternative that beats Domjudge on UX. The P2/P3 set turns it into a real learning platform.

I would use JudgeKit for an in-class exam today. I would not recommend it to a friend learning to code from scratch. With the P0+P1 list shipped, I would do both.
