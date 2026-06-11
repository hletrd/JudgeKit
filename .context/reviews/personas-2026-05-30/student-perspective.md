# Student / Exam-Taker / Contestant Perspective Review

Reviewer persona: a student doing a graded assignment, a candidate in a timed
exam, and a contestant in a ranked contest. Focus: the *real lived experience*
of submitting code under stress and a deadline. Findings cite `file:line` and
were verified against actual code (not comments or tests). "Confirmed" =
verified in source; "Suspected" = strong inference needing a runtime repro.

## Top risks for production use

Ranked by how badly they hurt a student/candidate in a graded, timed, or
ranked setting:

1. **Exam/contest timer expiry does nothing on the client — the editor stays
   editable and the Submit button stays enabled after time is up, then the
   server silently rejects the submission.** A candidate who is mid-edit when
   the clock hits 00:00 keeps typing, hits Submit, and gets a toast error
   instead of a graceful "time's up" lock + final-save. High risk of perceived
   data loss and "I submitted before the buzzer!" disputes.
   (`practice/problems/[id]/page.tsx:493-505`, `countdown-timer.tsx:56-62`)
   — **Confirmed, High.**

2. **Keyboard trap in the code editor (WCAG 2.1.2 failure).** CodeMirror binds
   `indentWithTab` with no Escape-then-Tab escape hatch, so a keyboard-only or
   screen-reader user who tabs into the editor cannot tab back out — they are
   trapped. This is a hard accessibility blocker for a graded assessment.
   (`code-surface.tsx:187-193`) — **Confirmed, High.**

3. **Anti-cheat heartbeat gate can block a legitimate candidate's submission on
   flaky wifi.** If the in-browser monitor's last event is older than 90 s when
   the candidate submits, the server returns `antiCheatHeartbeatRequired` (403)
   and the submission is refused — during a timed exam, on the candidate's own
   bad network, through no fault of their own.
   (`assignments/submissions.ts:298-317`) — **Confirmed, High.**

4. **`isSubmissionBlocked` is computed once at server render and never
   re-evaluated.** A student who opens the problem page well before the deadline
   and works for an hour sees a stale "open" UI; the countdown may show expired
   while the page still offers Submit (or vice-versa). The page never reconciles
   with server time after the initial render. (`practice/problems/[id]/page.tsx:200-216`)
   — **Confirmed, Medium-High.**

5. **Autosave only persists to `localStorage`; there is no server-side draft
   recovery.** If the student switches devices, clears their browser, or their
   machine dies, all unsubmitted work is gone. Code snapshots exist but are
   write-only anti-cheat telemetry the student cannot restore from.
   (`use-source-draft.ts`, `code-snapshots/route.ts`) — **Confirmed, Medium-High.**

6. **Leaderboard "anonymous" mode still leaks each row's rank via the
   pseudonym (`Participant {rank}`).** In a frozen/anonymous exam leaderboard,
   the synthesized name encodes the exact rank, so ordering and rank changes are
   fully observable — partially defeating anonymity and freeze.
   (`leaderboard/route.ts` entries map) — **Confirmed, Medium.**

7. **Confirmed Korean letter-spacing violation in `DropdownMenuShortcut`**
   (`tracking-widest` unconditional). Documented as "ASCII-only" but the
   component does not enforce it. (`ui/dropdown-menu.tsx:254`) — **Confirmed, Low**
   (per repo CLAUDE.md this is an explicit rule violation).

---

## Detailed findings by area

### A. Submission flow (editor, language, verdicts, test-case visibility)

**A1. Keyboard trap in the editor — WCAG 2.1.2 No Keyboard Trap (Confirmed, High).**
`code-surface.tsx:187-193` builds the keymap as:
```
keymap.of([{ key: "Enter", run: insertNewlineGnuStyle }, indentWithTab, ...defaultKeymap, ...historyKeymap])
```
`indentWithTab` makes Tab/Shift-Tab insert/remove indentation inside the editor.
CodeMirror's own docs warn this "binds Tab" and that you should provide an
Escape route; `defaultKeymap` does **not** include one. There is no
`{ key: "Escape", run: ... blur }` or "Escape then Tab moves focus" affordance.
Result: a keyboard-only student or screen-reader user who focuses the editor
cannot leave it with the keyboard — they cannot reach the Run/Submit buttons or
the language selector. For a graded assessment this is a blocking failure.
*Failure scenario:* a screen-reader candidate tabs into the editor to type their
solution, finishes, and is now stuck — Tab just indents. They cannot reach
Submit before the deadline.
*Fix:* add an Escape-based focus escape, e.g. bind `Escape` to a command that
calls `view.contentDOM.blur()` (or moves focus to a sentinel), and document
"Press Esc then Tab to leave the editor." This is the standard CodeMirror
accessibility pattern. The fullscreen Escape handler at `code-editor.tsx:42-52`
only exits fullscreen; it does not address the trap.

**A2. Hidden vs visible test-case data leakage — correctly handled (Done well).**
Both the SSR detail page (`submissions/[id]/page.tsx:137-170`) and the API
sanitizer (`lib/submissions/visibility.ts:30-56`) gate `actualOutput`,
`expectedOutput`, time, and memory on `testCase.isVisible` and the problem's
`showDetailedResults` / `showRuntimeErrors` flags. The polling refresh path goes
through `sanitizeSubmissionForViewer`, so live updates stay consistent with the
initial render. No hidden-test leak found. This is solid.

**A3. `submission_max_pending` / rate limits are correct but the messaging is
abrupt under contest pressure (Confirmed, Low-Medium).**
`submissions/route.ts:299-357` enforces per-user pending cap, per-minute cap,
and a global queue cap inside one advisory-locked transaction — correct and
race-safe. The student-facing messages exist and are clear
(`tooManyPendingSubmissions`, `judgeQueueFull`, `submissionRateLimited` at
`en.json:474-476`). The gap: these surface only as a transient `toast.error`
(`problem-submission-form.tsx:281`). During a contest a toast can be missed; the
form gives no persistent inline "your last submit was rejected, retry"
indicator, and the code the student typed is preserved (good) but they may not
realize the submission never entered the queue. *Fix:* render rate-limit / queue
rejections as a persistent inline alert in the submit card, not just a toast.

**A4. Submit button disabled state vs. async submit (Done well, minor).**
`handleSubmit` guards re-entry with `isSubmitting` (`problem-submission-form.tsx:316`)
and disables both Run and Submit while either is in flight. No double-submit
risk. Minor: there is no optimistic "submitting…" persistence if the user
navigates away mid-request, but `executeSubmit` finalizes state in `finally`.

**A5. Verdict / live status accessibility is mostly good (Done well).**
The submission header wraps status in `role="status" aria-live="polite"`
(`submission-detail-client.tsx:219`), and the judging progress bar has full
`role="progressbar"` + `aria-valuenow` (`live-submission-status.tsx:71-77`).
The polling-delayed retry is `aria-live="polite"`. Reasonable SR support.

**A6. `whitespace` language uses a raw `<textarea>` (Confirmed, Low).**
`RAW_TEXTAREA_LANGUAGES = new Set(["whitespace"])` (`language-map.ts:56`) routes
that language to a plain textarea (`code-editor.tsx:58-81`). That textarea is
*not* keyboard-trapped (Tab moves focus normally) — ironically more accessible
than the CodeMirror path. No autosave issue since it shares `onValueChange`.

### B. Exam-mode UX (timer, network loss, refresh, work loss, autosave)

**B1. Timer expiry is a no-op on the client (Confirmed, High).**
On the practice/exam problem page, `CountdownTimer` is rendered **without an
`onExpired` prop** (`practice/problems/[id]/page.tsx:493-505`). `onExpired` is
optional and only invoked when wired (`countdown-timer.tsx:56-62`). So when the
clock reaches zero: the timer badge flips to `00:00:00`, but the editor remains
editable, Run and Submit remain enabled, and nothing tells the student the
window closed. The only enforcement is server-side at submit time
(`submissions/route.ts:342-357` rejects with `examTimeExpired`). *Failure
scenario:* a windowed-exam candidate is finishing the last function as the timer
expires; they keep typing for 20 seconds, hit Submit, and get a red toast
("Your assessment time has ended"). Their work is rejected with no warning and
no graceful final-save. *Fix:* pass `onExpired` to lock the editor (readOnly),
disable Submit, show a persistent "time is up" panel, and ideally trigger one
last best-effort submit/snapshot of the current buffer.

**B2. Refresh mid-exam: draft survives, but exam state is re-fetched and can
surprise the student (Confirmed, Medium).** On refresh, `useSourceDraft`
rehydrates the code from `localStorage` (good — `use-source-draft.ts:246-266`).
But the page re-runs server logic: if the personal deadline passed while the tab
was open, the refreshed page redirects to the contest page on a failed
`validateAssignmentSubmission` (`practice/problems/[id]/page.tsx:173-175`) or
hides the submit UI, with the draft stranded in `localStorage` under a key the
student can no longer reach through the UI. The draft is not lost, but it is not
recoverable by the student either.

**B3. Network loss during exam (Confirmed, Medium).**
- Code snapshots retry with exponential backoff up to 3 attempts
  (`problem-submission-form.tsx:131-149`) — good for the audit trail.
- Anti-cheat events queue in `localStorage` and flush on reconnect
  (`anti-cheat-monitor.tsx:75-130`, `anti-cheat-storage.ts`) — good.
- BUT the **submission itself has no offline queue**: `executeSubmit` does a
  single `apiFetch`; on network failure it shows `tCommon("error")` and the
  student must manually retry (`problem-submission-form.tsx:301-302`). Combined
  with B1 (no expiry lock) and the 90 s anti-cheat freshness gate (B/C below),
  a candidate on flaky wifi can lose the ability to submit right at the
  deadline.

**B4. Anti-cheat heartbeat freshness can block honest submissions (Confirmed,
High).** `assignments/submissions.ts:298-317`: when `enableAntiCheat` and exam
mode != none, the submission is rejected (`antiCheatHeartbeatRequired`, 403)
unless an anti-cheat event was recorded within `ANTI_CHEAT_HEARTBEAT_FRESHNESS_MS`
(90 s). The heartbeat fires every 30 s only when `document.visibilityState ===
"visible"` (`anti-cheat-monitor.tsx:187-193`). *Failure scenario:* a candidate's
wifi drops for 2 minutes; heartbeats fail (queued for later), the last
server-recorded event is now >90 s old, and their submit at the deadline is
refused. The message (`en.json:482`) is helpful but the candidate has no time to
"let it sit for a few seconds." This trades candidate fairness for anti-cheat
strictness; at minimum the freshness window should be more forgiving, or a
queued offline submission should be honored once a fresh heartbeat lands.

**B5. Privacy notice modal blocks the whole exam UI until accepted (Confirmed,
Low-Medium).** `anti-cheat-monitor.tsx:305-340` shows a non-dismissable dialog;
until "Accept" is clicked, `enabled && showPrivacyNotice` short-circuits the
heartbeat/flush effects (`:170-205`). That's reasonable for consent, but the
exam countdown is already running behind the modal — time spent reading the
notice eats into the windowed-exam clock. Consider pausing/visually noting that
the timer is running, or showing the notice on the start-exam confirmation
(`start-exam-button.tsx`) before the session begins.

**B6. Autosave debounce + flush is well built (Done well).**
`use-source-draft.ts` debounces saves at 500 ms, flushes on `pagehide` and
`visibilitychange:hidden`, versions the payload, and TTL-expires after 7 days.
The unsaved-changes guard (`use-unsaved-changes-guard.ts`) warns on tab close
and intercepts client navigation. This is genuinely good work-loss protection —
*within a single browser profile*. The limitation is B7.

**B7. No server-side draft persistence / cross-device recovery (Confirmed,
Medium-High).** All draft state is `localStorage`-only. Code snapshots
(`code-snapshots/route.ts`) are stored server-side but are anti-cheat telemetry
with no student-facing "restore my last snapshot" path. *Failure scenario:* a
student's laptop crashes mid-assignment; on a borrowed machine their draft is
gone. For high-stakes graded work, a "recover last snapshot" affordance (read
the student's own latest `code_snapshots` row) would prevent real grief.

### C. Deadlines & late penalties (student's view)

**C1. Late-penalty math is consistent and correct across views (Done well).**
`buildIoiLatePenaltyCaseExpr` (`scoring.ts:138-165`) is the single SQL source of
truth, reused by the gradebook (`submissions.ts:616`) and the leaderboard
(`contest-scoring.ts:234`), and mirrored by the TS
`mapSubmissionPercentageToAssignmentPoints`. Windowed exams correctly penalize
against the per-user `personal_deadline`. Deadline checks use DB time
(`db-time.ts`) to avoid app/DB clock skew. This is well-engineered and fair.

**C2. The student never sees *why* their score was reduced (Confirmed, Medium).**
The penalty is applied silently in aggregation. On the assignment overview and
submission detail, a student sees a reduced `bestScore` but no "late: −X%" badge
or "submitted after deadline" marker tied to the number. *Failure scenario:* a
student submits 2 minutes late, sees 70/100 instead of 100/100, and has no
in-UI explanation — looks like a grading bug. *Fix:* surface a "late penalty
applied" indicator with the original vs adjusted score on the student's own
submission/overview view (`isSubmissionLate` already exists in `scoring.ts:61`).

**C3. Effective close time = `lateDeadline ?? deadline` (Confirmed, informational).**
`validateAssignmentSubmission` allows submissions until `lateDeadline` if set
(`submissions.ts:228`), and `isPast` on the assignment page uses the same logic
(`assignments/[assignmentId]/page.tsx:126-128`). Consistent. Just ensure the
student-facing countdown reflects which deadline is "the wall" — currently the
overview shows both deadline and late-deadline countdowns, which is good.

### D. Fairness (peer code/score visibility, leaderboard, clock/timezone)

**D1. Peer submission isolation is well-enforced (Done well).**
- Submissions list scopes non-staff to own + public-problem submissions only
  (`submissions/page.tsx:179-198`); contest/exam (private-problem) submissions of
  peers are not even listed as metadata.
- The detail page 404s non-owners on private-problem submissions unless they are
  instructors (`submissions/[id]/page.tsx:80-98`), preventing ID-guessing.
- Source code is stripped for non-owners without `view_source`
  (`visibility.ts:145-147`). Good defense in depth.

**D2. Anonymous leaderboard leaks rank through the pseudonym (Confirmed,
Medium).** `leaderboard/route.ts` builds anonymized entries as
`username: `Participant ${rest.rank}``. Since the row already carries `rank`,
the pseudonym is redundant *and* encodes the rank — so in a "frozen" or
"anonymous" exam leaderboard a viewer can read everyone's exact standing and
watch positions shift between refreshes. This undercuts the point of anonymity.
The freeze itself is implemented correctly (cutoff query in
`contest-scoring.ts:201-223`; current user gets a private `liveRank`). *Fix:*
use a stable per-user opaque token (e.g. hashed userId) for the pseudonym, not
the live rank, so identity is hidden and rank churn is not trivially observable.

**D3. Leaderboard reveals `isInactiveEntry` (totalScore===0) styling (Confirmed,
Low).** `leaderboard-table.tsx:383` mutes rows with zero score. In an anonymized
exam this exposes "who has scored nothing yet," a small information leak about
peers' progress. Cosmetic but worth noting for strict fairness.

**D4. Clock/timezone handling is robust (Done well).**
Server comparisons use DB `NOW()` (`db-time.ts`); the countdown timer syncs an
offset against `/api/v1/time` on mount and every tab refocus, and recomputes on
visibility change to defeat background-tab throttling (`countdown-timer.tsx:82-213`).
Display uses `Asia/Seoul` default with `Intl.DateTimeFormat` and `h23`
(`datetime.ts`). This is careful, fair clock handling. One nit: the timer's
threshold toasts and the displayed time rely on `offsetRef` which starts at 0
until the first `/api/v1/time` resolves — a brief window where a client with a
skewed clock sees a wrong countdown before sync lands.

### E. Accessibility (WCAG 2.2)

**E1. Editor keyboard trap — see A1 (Confirmed, High, WCAG 2.1.2).** The single
most serious a11y blocker for an assessment tool.

**E2. Countdown timer SR support is good (Done well).** Uses `role="timer"`,
plus a visually-hidden `aria-live` region that switches to `assertive` at the
1-minute mark (`countdown-timer.tsx:219-227`). Threshold announcements are
de-duplicated to avoid spam. Strong implementation.

**E3. Leaderboard color-only encoding (Confirmed, Medium, WCAG 1.4.1).**
IOI cells encode score purely via HSL hue/lightness
(`leaderboard-table.tsx:171-206`) and ICPC cells via green/blue/red background
(`:494-508`) with no non-color indicator beyond the numeric value (IOI) or
`+/−` text (ICPC). The IOI gradient `color: hsl(${hue}, 50%, 30%)` on a
`hsl(${hue}, 70%, ~85%)` background may also fail contrast at mid-range hues.
The number is present so it's not purely color-coded, but the score-intensity
signal is color-only. *Fix:* verify contrast ratios and consider a non-color
intensity cue (e.g. bar). Trophy rank icons rely on color too
(`getRankIcon` gold/silver/bronze) but rank number is adjacent — acceptable.

**E4. Reduced motion is respected globally (Done well).**
`globals.css:138-145` honors `prefers-reduced-motion: reduce` and neutralizes
animations/transitions, including the `animate-pulse` on the 1-minute timer
warning. Good.

**E5. Focus management on dialogs/sheets (Suspected, Low).** Submit form in a
Dialog/Sheet (`public-quick-submit.tsx`) relies on Base UI for focus trapping;
the anti-cheat privacy modal is non-dismissable by design. Not independently
verified for focus-return on close — worth a manual SR pass.

### F. i18n (Korean + English correctness; letter-spacing rule)

**F1. Korean letter-spacing rule — mostly enforced, one confirmed violation.**
The codebase is *disciplined* here: `globals.css:127-137` drives letter-spacing
via a custom property that `html:lang(ko)` resets to `normal`, and dozens of
components gate `tracking-*` with `locale !== "ko"`
(e.g. `submissions/page.tsx:318`, `rankings/page.tsx:233`,
`public-contest-list.tsx:41`). **Confirmed violation:**
`ui/dropdown-menu.tsx:254` applies `tracking-widest` unconditionally. The
doc-comment (`:242-244`) claims children are "ASCII-only keyboard shortcut
text," but nothing enforces it; any Korean label passed here gets non-default
spacing, violating the repo CLAUDE.md rule. **Confirmed, Low.**
`access-code-manager.tsx:154` (`tracking-widest` on a `font-mono` access code)
and the `404` / access-code cases are alphanumeric-only and acceptable.

**F2. Exam strings are correctly translated and friendly (Done well).**
`examWarning{15,5,1}Min`, `examTimeExpired`, `examNotStarted`, and the full
`submissionErrors.*` map are present and natural in both en and ko
(`en.json:458-488`, ko verified). Korean uses a friendly register
("남았어요", "끝났어요") consistently.

**F3. Submission error mapping covers all server codes (Done well).**
`translateSubmissionError` (`problem-submission-form.tsx:182-210`) falls through
to `submissionErrors.${code}` for codes not in the legacy map; every server
error code (`assignmentContextRequired`, `antiCheatHeartbeatRequired`,
`tooManyPendingSubmissions`, `judgeQueueFull`, `submissionRateLimited`,
`examTimeExpired`, etc.) has a key, with a `try/catch` fallback to a generic
error. No missing-key crash risk.

### G. States (loading / empty / error / perceived performance)

**G1. Leaderboard has full loading/empty/error states (Done well).**
Skeleton table while loading, retry button on error, "no entries" empty state
(`leaderboard-table.tsx:275-300`), abortable polling, visibility-gated refresh.

**G2. Submission detail live polling degrades gracefully (Done well).**
Queue-status polling pauses on hidden tabs, aborts on unmount, and surfaces a
"live updates delayed — retry" affordance on error
(`submission-detail-client.tsx:115-182`, `live-submission-status.tsx:86-93`).

**G3. Run-output truncation is sensible (Done well).** stdout/stderr capped at
2000 chars with a show-more toggle (`problem-submission-form.tsx:175-180,
422-469`); compile errors shown separately.

**G4. Generic `tCommon("error")` toasts hide root cause (Confirmed, Low).**
Network failures on Run/Submit and snapshot retries collapse to a single generic
"error" toast (`problem-submission-form.tsx:231-233, 301-302`). Under exam
stress a student cannot tell "the network blipped, retry" from "your code was
rejected." Consider distinguishing transport errors from server rejections.

---

## Priority-ranked fix checklist

1. **[High] Wire `onExpired` on the exam/contest problem page** to lock the
   editor (readOnly), disable Run/Submit, show a persistent "time is up" panel,
   and fire a final best-effort submit/snapshot. (`practice/problems/[id]/page.tsx:493-505`)
2. **[High] Add a keyboard escape from the CodeMirror editor** (bind `Escape`
   to blur / move focus to a sentinel) and document "Esc then Tab." Fixes WCAG
   2.1.2. (`code-surface.tsx:187-193`)
3. **[High] Make the anti-cheat heartbeat gate fair on flaky networks** — widen
   the freshness window, and/or accept a queued submission once a fresh
   heartbeat arrives, rather than hard-rejecting at the deadline.
   (`assignments/submissions.ts:298-317`, `anti-cheat-monitor.tsx:187-193`)
4. **[Medium-High] Re-evaluate submission-blocked / deadline state on the client
   over time** instead of only at server render, so the UI and countdown stay in
   sync as the page sits open. (`practice/problems/[id]/page.tsx:200-216`)
5. **[Medium-High] Provide student-facing draft recovery** from their own latest
   `code_snapshots` row (or persist drafts server-side), so a device crash /
   browser clear does not destroy unsubmitted work. (`code-snapshots/route.ts`,
   `use-source-draft.ts`)
6. **[Medium] Fix anonymous-leaderboard pseudonyms** to a stable opaque token
   instead of `Participant {rank}`, so rank is not encoded in the visible name.
   (`leaderboard/route.ts`)
7. **[Medium] Show the student why their score was reduced** (late-penalty
   badge: original vs adjusted). (`scoring.ts:61` `isSubmissionLate` + overview/detail)
8. **[Medium] Audit leaderboard color contrast and add a non-color intensity
   cue** for IOI/ICPC cells (WCAG 1.4.1 / 1.4.3). (`leaderboard-table.tsx:171-206, 494-508`)
9. **[Medium] Surface rate-limit / queue-full rejections as a persistent inline
   alert**, not just a toast, and distinguish transport errors from server
   rejections. (`problem-submission-form.tsx:281, 301-302`)
10. **[Low] Remove or guard `tracking-widest`** in `DropdownMenuShortcut` per the
    Korean letter-spacing rule. (`ui/dropdown-menu.tsx:254`)
11. **[Low] Move the anti-cheat privacy notice to the start-exam confirmation**
    so reading it doesn't eat windowed-exam time. (`anti-cheat-monitor.tsx:305-340`,
    `start-exam-button.tsx`)
