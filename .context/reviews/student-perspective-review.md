# Student Perspective Review: JudgeKit

**Reviewer:** Student user persona
**Date:** 2026-05-10
**Scope:** All student-facing UI, flows, and interactions in the JudgeKit codebase

---

## Summary

JudgeKit is a capable online judge platform with solid fundamentals, but has several friction points that would frustrate or confuse students in high-stakes scenarios (exams, contests, recruiting assessments). The most critical issues are around exam timer accuracy, anti-cheat false positives, submission confirmation delays, and code editor accessibility. Many issues are MEDIUM severity annoyances that accumulate into significant friction during daily use.

**Severity legend:**
- **CRITICAL:** Blocks learning or testing; could cause unfair outcomes
- **HIGH:** Significant friction; likely to generate support tickets
- **MEDIUM:** Annoying; degrades experience
- **LOW:** Minor; cosmetic or edge case

---

## 1. Exam Stress Factors

### 1.1 Timer drift risk from naive `Date.now()` synchronization
**File:** `src/components/exam/countdown-timer.tsx:83-96`
**Severity:** CRITICAL

The countdown timer fetches server time once at mount via `/api/v1/time` and computes a one-time `offsetRef`. After that, it relies on `setTimeout(..., 1000)` ticks. Browser timers in background tabs are throttled aggressively (can drift by seconds to minutes). A student who switches to a documentation tab or another browser window during an exam will see an inaccurate timer when they return. The `visibilitychange` handler (line 183-186) recalculates remaining time but does NOT re-sync with the server. A student could think they have 5 minutes left when the server thinks time expired 3 minutes ago, leading to failed submissions.

**Student impact:** Unfair exam termination. Lost submissions. Panic and stress.
**Fix:** Re-fetch `/api/v1/time` on every `visibilityState === 'visible'` event, not just recalculate. Or use a Web Worker with `setInterval` that keeps running in background tabs.

### 1.2 Threshold toast spam on tab refocus
**File:** `src/components/exam/countdown-timer.tsx:120-161`
**Severity:** HIGH

When a tab regains focus after being backgrounded, `recalculate(true)` fires with `staggerToasts = true`. If multiple thresholds crossed while backgrounded, students get a burst of toast warnings (e.g., "15 min left", "5 min left", "1 min left") staggered 2 seconds apart. During an exam, this is startling and distracting. The 1-minute warning also triggers `aria-live="assertive"` which aggressively interrupts screen reader users.

**Student impact:** Distracting toast barrage during concentration. Screen reader users get force-interrupted.
**Fix:** On tab refocus, only show the most urgent threshold that crossed, not all of them. Suppress threshold toasts entirely if the tab was backgrounded for more than some threshold (e.g., >30s).

### 1.3 No explicit "time is running out" audio or visual alarm
**File:** `src/components/exam/countdown-timer.tsx`
**Severity:** MEDIUM

At 1 minute remaining, the text pulses with `animate-pulse` and turns red. There is no audio cue, no modal dialog, no browser notification. Students wearing headphones, on small screens, or with color vision deficiency may miss this entirely.

**Student impact:** Sudden exam expiration without adequate warning.
**Fix:** Add an optional audio cue at 1-minute threshold (respecting `prefers-reduced-motion` and `prefers-reduced-sound`). Consider a non-blocking banner at top of page.

### 1.4 Exam button shows duration but not deadline
**File:** `src/components/exam/start-exam-button.tsx:69-71`
**Severity:** MEDIUM

The start exam confirmation dialog says "Duration: {duration} minutes" but does NOT show the actual deadline time. A student clicking "Start" at 11:55 PM for a 60-minute exam does not know the global deadline might be at 12:00 AM (only 5 minutes of actual working time).

**Student impact:** Misunderstanding of actual available time. Starting an exam with unexpectedly little time remaining.
**Fix:** Show both duration AND the computed personal deadline in the confirmation dialog.

---

## 2. Anti-Cheat Behavior

### 2.1 Privacy notice cannot be dismissed without accepting
**File:** `src/components/exam/anti-cheat-monitor.tsx:289-324`
**Severity:** HIGH

The privacy notice dialog uses `disablePointerDismissal` and has no close button (`showCloseButton={false}`). The `onOpenChange` handler is a no-op (`() => { /* prevent closing */ }`). Students are forced to accept monitoring with no ability to decline or even pause to read the terms. This is legally problematic under GDPR/PIPA and creates a coercive UX.

**Student impact:** Feeling of coercion. Potential regulatory compliance issues. Students may panic-click through without understanding what's monitored.
**Fix:** Allow dismissal with an explicit "I understand" button rather than forced acceptance. Provide a "Decline and exit exam" alternative that redirects them out of the exam.

### 2.2 Tab switch triggers immediate toast warning
**File:** `src/components/exam/anti-cheat-monitor.tsx:208-215`
**Severity:** HIGH

Every `visibilitychange` to `hidden` fires `reportEvent("tab_switch")` AND shows `toast.warning(resolvedWarningMessage)`. Accidental tab switching (Alt+Tab, clicking a notification, macOS Spotlight, browser auto-switch on external link) triggers a warning. There is no grace period or debounce. A student who accidentally cmd+tabs to check Slack for 2 seconds gets flagged.

**Student impact:** False positives in audit log. Anxiety during exam. Unfair reputation damage.
**Fix:** Add a grace period (e.g., 3 seconds) before reporting tab_switch. Distinguish between "brief visibility loss" and "actual tab switching."

### 2.3 `blur` event logged without context
**File:** `src/components/exam/anti-cheat-monitor.tsx:218-220`
**Severity:** MEDIUM

Every `window.blur` is reported as a distinct event. Clicking outside the browser window (e.g., to a PDF viewer, IDE, or system dialog) triggers this. There's no way for reviewers to distinguish "clicked to calculator app" from "clicked to ChatGPT."

**Student impact:** Ambiguous audit trails. Students can't defend themselves against false accusations.
**Fix:** Include active window title or application name when available (limited by browser APIs, but worth documenting the limitation).

### 2.4 `contextmenu` event blocks right-click entirely for audit
**File:** `src/components/exam/anti-cheat-monitor.tsx:257-259`
**Severity:** MEDIUM

Right-click (`contextmenu`) is logged but NOT prevented. However, some students use browser extensions that rely on right-click (grammar checkers, dictionary tools, accessibility tools). These become audit events even for legitimate uses.

**Student impact:** Accessibility tools flagged as suspicious behavior.
**Fix:** Document which accessibility tools are permitted. Consider whitelisting known accessibility extension behaviors.

### 2.5 Anti-cheat heartbeat pauses when tab hidden
**File:** `src/components/exam/anti-cheat-monitor.tsx:185-191`
**Severity:** MEDIUM

The heartbeat (line 188) is skipped when `document.visibilityState !== "visible"`. This means if a student switches tabs for 30 seconds, there is a gap in the heartbeat log. The audit log shows a discontinuity that could be interpreted as "attempting to evade monitoring."

**Student impact:** Gaps in audit log create suspicion without evidence of wrongdoing.
**Fix:** Continue heartbeats (or at least log "heartbeat missed: tab hidden") to show continuous monitoring.

### 2.6 Anti-cheat events stored in unencrypted localStorage
**File:** `src/components/exam/anti-cheat-storage.ts`
**Severity:** MEDIUM

Pending anti-cheat events are stored in `localStorage` with the key `judgekit_anticheat_pending_${assignmentId}`. This data is readable by any JavaScript on the page, including browser extensions. A malicious extension could read, modify, or delete this data.

**Student impact:** Tampering with evidence. Privacy leakage of exam behavior to third-party extensions.
**Fix:** Use `sessionStorage` (already used for notice acceptance) or encrypt the payload with a session key.

---

## 3. Code Editor Experience

### 3.1 CodeMirror lacks auto-save or crash recovery
**File:** `src/components/code/code-surface.tsx`
**Severity:** HIGH

The CodeMirror editor (`code-surface.tsx`) has no auto-save mechanism. If the browser crashes, the student loses all code. The `useSourceDraft` hook (see 4.1) provides localStorage persistence for submission drafts, but the compiler/playground (`compiler-client.tsx`) uses its own `useState` for sourceCode with no persistence. Students using the playground lose work on refresh.

**Student impact:** Lost work on browser crash or accidental refresh. Especially painful during long debugging sessions.
**Fix:** Add `localStorage` persistence to the playground/compiler client. Show a "restore unsaved code" prompt on re-entry.

### 3.2 No vim/emacs keybinding option
**File:** `src/components/code/code-surface.tsx`
**Severity:** MEDIUM

The CodeMirror configuration includes `defaultKeymap` and `historyKeymap` but no vim or emacs keymaps. Competitive programmers often prefer vim bindings. The `VimScrollShortcuts` component (see 6.2) only handles hjkl scrolling, not editing.

**Student impact:** Muscle memory conflict. Reduced typing speed for vim users.
**Fix:** Add `@replit/codemirror-vim` or similar as an optional keymap toggle in user preferences.

### 3.3 Language extension loading is async and can fail silently
**File:** `src/components/code/code-surface.tsx:390-403`
**Severity:** MEDIUM

`getLanguageExtension` dynamically imports language support. If the import fails (network issue, CDN problem, bundler issue), the editor falls back to no syntax highlighting with no user-facing error. Students see plain text and may think the language selector is broken.

**Student impact:** Confusion about whether syntax highlighting is working. No feedback on why it's missing.
**Fix:** Show a subtle indicator when language support fails to load (e.g., a small warning icon on the language selector).

### 3.4 RAW_TEXTAREA_LANGUAGES fallback loses all editor features
**File:** `src/components/code/code-editor.tsx:58-80`
**Severity:** MEDIUM

Languages in `RAW_TEXTAREA_LANGUAGES` (e.g., `plaintext`, `verilog`, `vhdl`) render as a plain `<textarea>` instead of CodeMirror. This loses: syntax highlighting, bracket matching, auto-indent, command history, and the `Mod-Enter` submit shortcut. Students using these languages get a degraded experience.

**Student impact:** Second-class editing experience for HDL and output-only languages.
**Fix:** Render CodeMirror even for "plain" languages. CodeMirror works fine without a language mode; it just lacks syntax coloring.

### 3.5 Fullscreen editor lacks font size controls
**File:** `src/components/code/code-editor.tsx`, `src/components/code/shortcuts-help.tsx:25`
**Severity:** LOW

The shortcuts help mentions `+/−` for font size, but `code-editor.tsx` and `code-surface.tsx` have no actual font size adjustment UI or keyboard handler. The `fontSize` prop exists in `CodeSurface` but is not exposed in `CodeEditor` or wired to any control.

**Student impact:** Non-functional shortcut listed in help. Students who need larger fonts for accessibility have no way to adjust.
**Fix:** Implement actual font size controls or remove the misleading shortcut from help.

---

## 4. Submission Workflow

### 4.1 Draft persistence has 7-day TTL that silently expires
**File:** `src/hooks/use-source-draft.ts:9`
**Severity:** HIGH

Draft code is persisted to `localStorage` with a 7-day TTL (`DRAFT_TTL_MS = 1000 * 60 * 60 * 24 * 7`). After 7 days, the draft is silently deleted on next access. A student working on a problem across multiple weeks (common in semester-long courses) loses their saved code without warning.

**Student impact:** Unexpected loss of saved work. Students may not realize drafts expire.
**Fix:** Increase TTL to 90+ days. Show a warning when loading a draft that is nearing expiration. Never auto-delete without user confirmation.

### 4.2 4-second submit confirmation is confusing and stressful
**File:** `src/components/problem/problem-submission-form.tsx:242-334`
**Severity:** HIGH

Submissions are held behind a 4-second cancel window. The toast says "Confirming submission..." with a cancel action. For exams with limited submission slots, this is appropriate. For practice problems, it's pure friction. The confirmation window is the SAME for all contexts (practice, exam, contest). There is no way for students to disable it for practice mode.

**Student impact:** Extra 4 seconds of anxiety on every submit. Muscle memory of double-tapping Ctrl+Enter gets interrupted. In timed contests, this is precious time lost.
**Fix:** Make the confirmation delay context-aware: 0s for practice, configurable for exams/contests. Allow students to opt out after their first few submissions.

### 4.3 Output truncation at 2000 chars with no clear indicator of truncation point
**File:** `src/components/problem/problem-submission-form.tsx:158-163`
**Severity:** MEDIUM

Run output is truncated at `MAX_OUTPUT_CHARS = 2000`. The truncation logic shows "Show more / Show less" but does not indicate WHERE in the output the truncation happened (beginning? middle? end?). For debugging, students need to see the tail of output, not the head.

**Student impact:** Debugging is harder when critical error messages may be at the end of truncated output.
**Fix:** Always show the last N characters rather than the first N. Or use a scrollable container with a large max-height instead of character truncation.

### 4.4 Unsaved changes guard uses English-only confirm dialog
**File:** `src/hooks/use-unsaved-changes-guard.ts:199`
**Severity:** MEDIUM

The `window.confirm(warningMessage)` uses a hardcoded English default: "You have unsaved code changes. Leave this page?" This string is passed as a prop but `ProblemSubmissionForm` does not pass a translated message.

**Student impact:** Korean students see an English confirmation dialog when navigating away with unsaved code.
**Fix:** Pass a translated warning message through the i18n system.

### 4.5 Submit shortcut label shows wrong modifier on iPad
**File:** `src/components/problem/problem-submission-form.tsx:59-65`
**Severity:** LOW

The submit shortcut label detects Mac via `navigator.platform` or `navigator.userAgent`. On iPad with external keyboard (which runs iPadOS and reports as "iPad"), the label shows "Ctrl+Enter" instead of "⌘+Enter". iPad keyboards use the command key for shortcuts.

**Student impact:** Minor confusion about which key to press.
**Fix:** Also check for `iPad` in the user agent string for the command key label.

---

## 5. Submission Feedback

### 5.1 Compile output hidden by default without explanation
**File:** `src/app/(public)/submissions/[id]/page.tsx:114-116`
**Severity:** HIGH

`showCompileOutput`, `showDetailedResults`, and `showRuntimeErrors` are gated by `isOwner && (problem.showCompileOutput ?? true)`. For non-owners (including students viewing peer submissions in public contests), compile output is completely hidden. More critically, for the OWNER, if an admin disables `showCompileOutput` on the problem, the student sees a card saying "Compile output hidden" with no explanation of WHY or how to enable it.

**Student impact:** Stuck debugging without compiler feedback. No explanation of why compile output is missing.
**Fix:** When compile output is hidden, explain "Compile output is hidden by problem settings. Contact your instructor if you need this information."

### 5.2 Wrong answer diff shows expected output for ALL visible test cases
**File:** `src/components/submissions/_components/submission-result-panel.tsx:103-111`
**Severity:** MEDIUM

The diff view only shows when `result.testCase?.expectedOutput != null && result.actualOutput != null`. The visibility of expected output is gated by `testCase.isVisible`. However, if a problem has multiple visible test cases that all fail, the student sees diffs for ALL of them in a vertical stack. This can be overwhelming for problems with 10+ visible test cases.

**Student impact:** Information overload. Hard to spot which specific test case matters.
**Fix:** Collapse diffs by default; expand on click. Show only the first failing diff by default.

### 5.3 Runtime error output uses generic fallback message
**File:** `src/components/submissions/submission-detail-client.tsx`
**Severity:** MEDIUM

The `runtimeErrorType` field is displayed as-is if not in `RUNTIME_ERROR_KEYS`. Unknown signals (e.g., `SIGBUS`, `SIGILL`) show the raw signal name with no human-readable explanation. Students don't know what `SIGBUS` means.

**Student impact:** Confusion about what went wrong. No guidance on how to fix.
**Fix:** Add all common POSIX signals to `RUNTIME_ERROR_KEYS`. Provide a brief explanation for each (e.g., "SIGBUS: Invalid memory access (alignment issue)").

### 5.4 No explanation for "time limit exceeded" vs "timed out"
**File:** `src/components/problem/problem-submission-form.tsx:450-454`
**Severity:** LOW

In the run panel, `timedOut` and `oomKilled` are shown with labels from `t("timedOut")` and `t("memoryLimitExceeded")`. But in the submission detail, "time_limit" status shows the execution time vs limit. Students may confuse "timed out" (from compiler run) with "time limit exceeded" (from judge). These are different systems with different limits.

**Student impact:** Confusion about which limit applies. The playground/compiler may have different limits than the judge.
**Fix:** Always show the actual limit value alongside the status. Clarify in tooltips that compiler run limits may differ from judge limits.

---

## 6. Accessibility

### 6.1 Countdown timer badge lacks accessible live region
**File:** `src/components/exam/countdown-timer.tsx:205-214`
**Severity:** HIGH

The timer uses `role="timer"` on the badge, but the actual time text is not in an `aria-live` region until a threshold fires. Screen reader users hear nothing as the timer counts down. They only get notified at 15/5/1 minute thresholds. Between thresholds, the timer is silent.

**Student impact:** Screen reader users have no awareness of time pressure until it's too late.
**Fix:** Add `aria-live="polite"` to the timer text itself, or use a `role="timer"` with `aria-valuenow`/`aria-valuemax` pattern.

### 6.2 Vim scroll shortcuts hijack hjkl globally
**File:** `src/components/layout/vim-scroll-shortcuts.tsx`
**Severity:** MEDIUM

The `VimScrollShortcuts` component listens for `h`, `j`, `k`, `l` keys globally (when not in inputs). This conflicts with: browser find-in-page (`/`), Quick Navigation in Safari (`Cmd+L` for address bar is fine, but plain `l` is not), and any other page shortcuts. There's no way to disable this.

**Student impact:** Students who don't use vim accidentally trigger page scrolling when typing `j` or `k` outside inputs. No way to disable.
**Fix:** Only enable vim scroll shortcuts when explicitly opted in via user preference. Default to OFF.

### 6.3 Problem keyboard nav hijacks `n` and `p` keys
**File:** `src/app/(public)/practice/problems/[id]/problem-keyboard-nav.tsx:14-18`
**Severity:** MEDIUM

The `n` key navigates to next problem, `p` to previous. This is active globally via `useKeyboardShortcuts` which ignores inputs but NOT CodeMirror. Wait, `useKeyboardShortcuts` DOES ignore `.cm-content`. But if a student is typing in a non-CodeMirror textarea (like the stdin textarea), `n` and `p` work fine. However, the shortcut is undocumented on the problem page itself (only in the `?` dialog which many students don't know about).

**Student impact:** Accidental navigation away from problem when trying to type `n` or `p` in non-editor inputs. Lost unsaved code if the guard fails.
**Fix:** Show a small keyboard hint tooltip on first visit. Allow opt-out in preferences.

### 6.4 Submission status badge tooltip is not keyboard accessible
**File:** `src/components/submission-status-badge.tsx:195-215`
**Severity:** MEDIUM

The tooltip uses `TooltipTrigger` with `render={<button type="button" ... />}`. The inner button has `tabIndex={-1}` implicitly via the render prop pattern? Actually, the `TooltipTrigger` from Radix UI should handle focus. But the button inside has `cursor: default` and no visible focus ring in the inline styles. Keyboard users may not realize the tooltip is focusable.

**Student impact:** Keyboard-only users cannot access detailed submission information in tooltips.
**Fix:** Ensure the tooltip trigger has a visible focus indicator and is reachable via Tab key.

### 6.5 Code editor fullscreen button lacks visible focus ring
**File:** `src/components/code/code-editor.tsx:96-105`
**Severity:** LOW

The fullscreen toggle button uses `hover:text-foreground hover:bg-muted` but no explicit `focus-visible` styles. Tailwind may apply defaults, but the custom styling could override them.

**Student impact:** Keyboard users cannot see when the fullscreen button is focused.
**Fix:** Add `focus-visible:ring-2 focus-visible:ring-ring` to the button.

---

## 7. Mobile/Tablet Usability

### 7.1 Problem page two-column layout collapses poorly on tablet
**File:** `src/app/(public)/practice/problems/[id]/page.tsx:512`
**Severity:** HIGH

The problem page uses `lg:grid-cols-2` which means on tablets (between 768px and 1024px), the layout is still single-column. The submission form card is `sticky top-6` but in single-column mode it scrolls with the page, creating a very long page. Students on iPad Pro or similar tablets get a desktop-like viewport but single-column layout.

**Student impact:** Excessive scrolling on tablets. Code editor and problem description compete for vertical space.
**Fix:** Use `md:grid-cols-2` instead of `lg:grid-cols-2` for earlier breakpoint. Or use a resizable split pane.

### 7.2 Mobile submission uses bottom Sheet that covers half the screen
**File:** `src/components/problem/public-quick-submit.tsx:77-93`
**Severity:** MEDIUM

On mobile (`useIsMobile`), the submission dialog becomes a bottom Sheet with `max-h-[90vh]`. The code editor inside the Sheet has a minimum height of 300px. On small phones, this leaves almost no room for the problem description, language selector, and buttons.

**Student impact:** Very cramped submission UI on phones. Hard to see what you're typing.
**Fix:** On mobile, navigate to a dedicated submission page instead of using a Sheet. Or make the Sheet full-screen.

### 7.3 Language selector dropdown is not scrollable on small viewports
**File:** `src/components/language-selector.tsx:206`
**Severity:** MEDIUM

The dropdown popup has `max-h-[min(calc(var(--available-height,400px)-48px),360px)]`. On mobile with virtual keyboard open, `--available-height` may be very small, causing the popup to be cut off.

**Student impact:** Cannot scroll to select languages on mobile with keyboard open.
**Fix:** Ensure the dropdown is properly constrained to viewport and scrollable on small screens.

---

## 8. i18n Gaps

### 8.1 Default warning message in unsaved changes guard is hardcoded English
**File:** `src/hooks/use-unsaved-changes-guard.ts:6`
**Severity:** HIGH

`const DEFAULT_WARNING_MESSAGE = "You have unsaved code changes. Leave this page?";` is hardcoded English. The `ProblemSubmissionForm` does not pass a translated message.

**Fix:** Import `useTranslations` in the hook or require callers to pass a translated string.

### 8.2 Compiler client default code comments are English-only
**File:** `src/components/code/compiler-client.tsx:58-77`
**Severity:** MEDIUM

The `DEFAULT_CODE` object contains English comments like `#include <bits/stdc++.h>` and `using namespace std;`. These are code snippets, not UI text, so they don't need translation. However, the `buildDefaultTestCaseName` function uses a hardcoded template string replacement pattern.

**Fix:** N/A for code comments, but ensure test case labels are translated.

### 8.3 Error fallback in shortcuts help is English
**File:** `src/components/code/shortcuts-help.tsx:22-27`
**Severity:** LOW

Each shortcut action falls back to English if translation key is missing: `t("shortcutSubmit") || "Submit code"`. The `||` fallback is unnecessary since `next-intl` returns the key itself if missing, but the explicit English fallback makes it worse.

**Fix:** Remove the `|| "..."` fallbacks. Let `next-intl` handle missing keys naturally.

### 8.4 Anti-cheat signal descriptions are not in i18n
**File:** `src/components/exam/anti-cheat-monitor.tsx:222-243`
**Severity:** LOW

The `describeElement` function returns English strings like `"code-editor"`, `"problem-description"`, `"input-field"`. These are sent to the server as part of the audit log and are never translated.

**Fix:** These are internal audit labels, not user-facing. Acceptable as-is.

### 8.5 Tracking classes conditionally applied for non-Korean locales
**File:** Multiple files (not-found.tsx, contest-join-client.tsx, etc.)
**Severity:** LOW

The codebase correctly applies conditional tracking: `${locale !== "ko" ? " tracking-tight" : ""}`. This is good. However, there are a few places where tracking is applied unconditionally:
- `src/app/(public)/not-found.tsx:24`: `tracking-[0.2em]` on "404" (this is a decorative numeric string, not Korean text — acceptable)
- `src/app/(public)/contests/join/contest-join-client.tsx:123`: `tracking-[0.35em]` on access code input (this is explicitly commented as "for alphanumeric access codes" — acceptable)

These appear to be intentionally narrow cases. No Korean text is affected.

---

## 9. Edge Cases and Network Issues

### 9.1 Code snapshot POST silently fails
**File:** `src/components/problem/problem-submission-form.tsx:128-132`
**Severity:** HIGH

Code snapshots (for exam anti-cheat) are sent every 10-60 seconds via `apiFetch(...).catch(() => {})`. On network failure, the error is silently swallowed. A student with intermittent connectivity loses their snapshot history with no indication. If the anti-cheat system later reviews snapshots, gaps appear suspicious.

**Student impact:** Network issues create suspicious gaps in code snapshot history.
**Fix:** Retry failed snapshots with exponential backoff. Show a subtle connectivity indicator when snapshots are failing.

### 9.2 SSE parse failure stops polling entirely
**File:** `src/hooks/use-submission-polling.ts:143-148`
**Severity:** MEDIUM

If SSE message parsing fails, `setIsPolling(false)` and `setError(true)` are called, but there is no retry mechanism. The submission detail page shows "live updates delayed" with a retry button, but the automatic SSE-to-polling fallback is broken.

**Student impact:** Need to manually click retry to see submission updates.
**Fix:** After SSE parse failure, automatically fall back to fetch polling without requiring manual retry.

### 9.3 Queue status polling continues even after submission is judged
**File:** `src/components/submissions/submission-detail-client.tsx:115-182`
**Severity:** LOW

The queue status poller runs every 5 seconds while `isLive` is true. When the submission transitions from "judging" to "accepted", the `isLive` check should stop the poller. But the cleanup effect runs on `isLive` change, which should work. However, there is a race condition: if the status transitions between the poller scheduling its next tick and the effect cleanup running, an extra poll fires after judgment.

**Student impact:** One extra unnecessary API call. Negligible.
**Fix:** Add a guard in `pollQueueStatus` to check `isLive` at the start of each poll.

### 9.4 Compiler run abort controller not reset on successful completion
**File:** `src/components/code/compiler-client.tsx:254-301`
**Severity:** LOW

The abort controller is created per-run but only reset in `finally`. If the run succeeds, `abortControllerRef.current = null` is set. This is correct. However, if multiple rapid runs are triggered (e.g., student mashes Run button), the ref-based `isRunningRef` check prevents concurrent runs, but there is a brief window where the button could be clicked twice before `isRunningRef.current = true` takes effect.

**Student impact:** Rare race condition causing duplicate API calls.
**Fix:** Use React state exclusively; the ref-based pattern adds complexity without clear benefit given React 18's automatic batching.

---

## 10. Contest Fairness and Clarity

### 10.1 Leaderboard shows live rank during frozen state without clear explanation
**File:** `src/components/contest/leaderboard-table.tsx:380-385`
**Severity:** MEDIUM

During a frozen leaderboard, the current user's row shows a "live rank" badge with `aria-live="polite"`. But there's no explanation of what "live rank" means or why it differs from the displayed rank. New students may not understand the freeze concept.

**Student impact:** Confusion about actual standing vs displayed standing during freeze.
**Fix:** Add a tooltip or info icon explaining "Live rank = your current position if the leaderboard were not frozen."

### 10.2 ICPC cell formatting uses `\n` which may not render consistently
**File:** `src/components/contest/leaderboard-table.tsx:69-81`
**Severity:** LOW

`formatIcpcCell` returns a string with embedded `\n` (literal newline). The cell renders with `whitespace-pre-line` in the TableCell className. If Tailwind's `whitespace-pre-line` is not applied correctly, the newline may not render.

**Student impact:** Minor visual inconsistency in ICPC leaderboard cells.
**Fix:** Use a `<div>` with two `<span>` children instead of a single string with newline.

### 10.3 Contest join page clears access code from URL but not history
**File:** `src/app/(public)/contests/join/contest-join-client.tsx:20-27`
**Severity:** LOW

The access code is cleared from the visible URL via `window.history.replaceState`, but it remains in browser history. Pressing back button after joining may show the code in the URL again.

**Student impact:** Minor privacy leak of access code in browser history.
**Fix:** Acceptable. `replaceState` is the best available mechanism. Full history scrubbing requires `history.pushState` gymnastics that are fragile.

---

## 11. Dashboard and Navigation

### 11.1 Student dashboard has no "resume last problem" shortcut
**File:** `src/app/(public)/dashboard/_components/student-dashboard.tsx`
**Severity:** MEDIUM

The student dashboard shows progress stats, recent submissions, and upcoming deadlines. There is no prominent "Continue where you left off" or "Resume last problem" call-to-action. Students with many assignments must hunt through the list.

**Student impact:** Extra clicks to get back to active work.
**Fix:** Add a "Resume last problem" card at the top of the dashboard, linking to the most recently viewed problem with an active draft.

### 11.2 Active timed assignments sidebar panel missing from student view
**File:** Not found in student-facing routes
**Severity:** MEDIUM

The codebase has an `active-timed-assignment-sidebar-panel.tsx` component (untracked in git) but it is not integrated into the student dashboard or problem pages. Students with multiple active exams/contests have no at-a-glance view of all their running timers.

**Student impact:** Must navigate to each contest individually to check remaining time.
**Fix:** Integrate the active assignment sidebar into the public layout when the user has active timed assignments.

### 11.3 Recent submissions on dashboard lack status badges with context
**File:** `src/app/(public)/dashboard/_components/student-dashboard.tsx:236-241`
**Severity:** LOW

Recent submissions show only the raw status string (e.g., "accepted", "wrong_answer") with no `SubmissionStatusBadge` component. This means no color coding, no execution time context, no failed test case info.

**Student impact:** Less informative dashboard view. Can't quickly spot which recent submission needs attention.
**Fix:** Use `SubmissionStatusBadge` in the dashboard recent submissions list.

### 11.4 "My Groups" card shows only count, no list
**File:** `src/app/(public)/dashboard/_components/student-dashboard.tsx:151-160`
**Severity:** LOW

The "My Groups" dashboard card shows a single number (group count) with a "View all" link. Students cannot see group names or navigate directly to a specific group without an extra click.

**Student impact:** Extra navigation step to reach specific groups.
**Fix:** Show the top 3 group names as quick links in the card.

---

## 12. Recruiting / Job Applicant Experience

### 12.1 Recruit start form silently signs out existing session
**File:** `src/app/(auth)/recruit/[token]/recruit-start-form.tsx:78`
**Severity:** HIGH

`await signOut({ redirect: false }).catch(() => {})` is called unconditionally before signing in with the recruit token. If a student is already logged into their personal account and clicks a recruiting link, they are silently signed out. There is no warning or explanation.

**Student impact:** Loss of existing session context. If they abort the recruiting assessment, they must re-login to their main account.
**Fix:** Show a warning dialog: "Starting this assessment will sign you out of your current account. Continue?"

### 12.2 Recruiting page shows "review notice" that sounds accusatory
**File:** `src/app/(auth)/recruit/[token]/page.tsx:306-315`
**Severity:** MEDIUM

The recruiting page shows a blue notice box with bullet points: "Submissions are recorded", "Behavior signals are logged", "AI-generated code may be detected", "AI detection is not guaranteed". While necessary for transparency, the tone is adversarial. Candidates may feel distrusted before they even start.

**Student impact:** Increased anxiety before a high-stakes assessment. Negative impression of the hiring company.
**Fix:** Soften the language. Frame as "For your protection, we log session activity to ensure a fair assessment process" rather than "We are watching you."

### 12.3 No way to preview supported languages before starting assessment
**File:** `src/app/(auth)/recruit/[token]/page.tsx:222-295`
**Severity:** MEDIUM

The recruiting page shows up to 6 languages as tag badges, with a "+N more" indicator. There is no link to view the full language list before starting. A candidate who needs a specific language (e.g., Kotlin) cannot verify it's available without starting the assessment.

**Student impact:** Candidates may start an assessment and then discover their preferred language is unavailable.
**Fix:** Add a "View all supported languages" link that opens in a new tab (non-exam context).

---

## 13. Playground / Compiler

### 13.1 Playground redirects recruiting candidates to dashboard
**File:** `src/app/(public)/playground/page.tsx:48-54`
**Severity:** MEDIUM

Recruiting candidates are redirected away from the playground to `/dashboard`. This prevents them from using the playground to test syntax before an assessment. The rationale is likely to prevent cheating, but it also prevents legitimate practice.

**Student impact:** No way to warm up or test language syntax before a recruiting assessment.
**Fix:** Allow playground access for recruiting candidates but log usage as an audit event.

### 13.2 Compiler client has no stdin history or persistence
**File:** `src/components/code/compiler-client.tsx`
**Severity:** MEDIUM

Test case stdin values are lost on page refresh. There is no way to save or reuse test cases across sessions.

**Student impact:** Must re-type test inputs every time they return to the playground.
**Fix:** Persist test cases to `localStorage` with the same TTL as code drafts.

---

## 14. Final Sweep: Files That May Have Been Missed

After reviewing the codebase, the following student-facing files were examined:

**Problem solving:**
- `src/app/(public)/practice/problems/[id]/page.tsx` - Full review
- `src/app/(public)/problems/[id]/page.tsx` - Redirect only
- `src/components/problem/problem-submission-form.tsx` - Full review
- `src/components/problem/public-quick-submit.tsx` - Full review
- `src/components/code/code-editor.tsx` - Full review
- `src/components/code/code-surface.tsx` - Full review
- `src/components/code/code-viewer.tsx` - Full review
- `src/components/code/compiler-client.tsx` - Full review
- `src/components/code/shortcuts-help.tsx` - Full review
- `src/components/problem-description.tsx` - Full review
- `src/components/problem/structured-problem-statement.tsx` - Full review

**Exam/Contest:**
- `src/app/(public)/contests/[id]/page.tsx` - Full review
- `src/app/(public)/contests/join/contest-join-client.tsx` - Full review
- `src/components/exam/countdown-timer.tsx` - Full review
- `src/components/exam/anti-cheat-monitor.tsx` - Full review
- `src/components/exam/start-exam-button.tsx` - Full review
- `src/components/exam/anti-cheat-storage.ts` - Full review
- `src/components/contest/leaderboard-table.tsx` - Full review
- `src/components/assignment/assignment-overview.tsx` - Full review

**Submissions:**
- `src/app/(public)/submissions/page.tsx` - Full review
- `src/app/(public)/submissions/[id]/page.tsx` - Full review
- `src/components/submissions/submission-detail-client.tsx` - Full review
- `src/components/submissions/_components/submission-result-panel.tsx` - Full review
- `src/components/submissions/_components/live-submission-status.tsx` - Full review
- `src/components/submissions/output-diff-view.tsx` - Full review
- `src/components/submission-status-badge.tsx` - Full review

**Hooks:**
- `src/hooks/use-submission-polling.ts` - Full review
- `src/hooks/use-source-draft.ts` - Full review
- `src/hooks/use-unsaved-changes-guard.ts` - Full review
- `src/hooks/use-keyboard-shortcuts.ts` - Full review
- `src/hooks/use-visibility-polling.ts` - Full review

**Layout/Navigation:**
- `src/app/(public)/layout.tsx` - Full review
- `src/app/layout.tsx` - Full review
- `src/components/layout/public-header.tsx` - Full review
- `src/components/layout/public-footer.tsx` - Full review
- `src/components/layout/skip-to-content.tsx` - Full review
- `src/components/layout/vim-scroll-shortcuts.tsx` - Full review

**Dashboard:**
- `src/app/(public)/dashboard/_components/student-dashboard.tsx` - Full review

**Recruiting:**
- `src/app/(auth)/recruit/[token]/page.tsx` - Full review
- `src/app/(auth)/recruit/[token]/recruit-start-form.tsx` - Full review

**Playground:**
- `src/app/(public)/playground/page.tsx` - Full review

**Misc:**
- `src/components/language-selector.tsx` - Full review
- `src/components/resource-usage-bar.tsx` - Full review
- `src/lib/judge/code-templates.ts` - Full review
- `src/lib/anti-cheat/review-model.ts` - Full review
- `src/lib/submissions/status.ts` - Full review
- `src/lib/judge/status-labels.ts` - Full review

**i18n:**
- `messages/en.json` - Partial review (first 300 lines, key structure)
- `messages/ko.json` - Verified to have same keys as en.json, only 1 empty value

---

## Priority Ranking

### CRITICAL (fix immediately)
1. Timer drift from naive `Date.now()` sync (`countdown-timer.tsx:83-96`)
2. Privacy notice is coercive, non-dismissible (`anti-cheat-monitor.tsx:289-324`)
3. Tab switch triggers immediate warning without grace period (`anti-cheat-monitor.tsx:208-215`)
4. Draft TTL silently expires after 7 days (`use-source-draft.ts:9`)
5. Compile output hidden without explanation (`submissions/[id]/page.tsx:114-116`)
6. Code snapshot POST silently fails on network errors (`problem-submission-form.tsx:128-132`)
7. Timer not announced to screen readers between thresholds (`countdown-timer.tsx:205-214`)

### HIGH (fix soon)
8. Threshold toast spam on tab refocus (`countdown-timer.tsx:120-161`)
9. CodeMirror lacks auto-save/crash recovery (`code-surface.tsx`)
10. 4-second submit confirmation applies to all contexts (`problem-submission-form.tsx:242-334`)
11. Recruit start form silently signs out existing session (`recruit-start-form.tsx:78`)
12. Unsaved changes guard uses hardcoded English (`use-unsaved-changes-guard.ts:6`)
13. Tablet layout remains single-column too long (`practice/problems/[id]/page.tsx:512`)
14. Mobile submission Sheet is too cramped (`public-quick-submit.tsx:77-93`)

### MEDIUM (nice to have)
15. No vim keybinding option (`code-surface.tsx`)
16. Vim scroll shortcuts enabled by default (`vim-scroll-shortcuts.tsx`)
17. Problem keyboard nav hijacks `n`/`p` (`problem-keyboard-nav.tsx`)
18. Raw textarea languages lose editor features (`code-editor.tsx:58-80`)
19. Output truncation shows head instead of tail (`problem-submission-form.tsx:158-163`)
20. Leaderboard live rank lacks explanation (`leaderboard-table.tsx:380-385`)
21. Heartbeat pauses when tab hidden (`anti-cheat-monitor.tsx:185-191`)
22. Recruiting page tone is adversarial (`recruit/[token]/page.tsx:306-315`)
23. No "resume last problem" on dashboard (`student-dashboard.tsx`)
24. Playground redirects recruiting candidates (`playground/page.tsx:48-54`)
25. No audio/visual alarm at 1 minute (`countdown-timer.tsx`)
26. Blur events logged without context (`anti-cheat-monitor.tsx:218-220`)
27. Runtime error signals lack explanations (`submission-status-badge.tsx`)
28. Context menu logged without accessibility consideration (`anti-cheat-monitor.tsx:257-259`)

### LOW (cosmetic)
29. Fullscreen button lacks focus ring (`code-editor.tsx:96-105`)
30. Submit shortcut shows wrong modifier on iPad (`problem-submission-form.tsx:59-65`)
31. ICPC cell newline formatting (`leaderboard-table.tsx:69-81`)
32. Access code in browser history (`contest-join-client.tsx:20-27`)
33. Shortcuts help has English fallbacks (`shortcuts-help.tsx:22-27`)
34. Queue status polling race condition (`submission-detail-client.tsx:115-182`)
35. Language extension import failures are silent (`code-surface.tsx:390-403`)
