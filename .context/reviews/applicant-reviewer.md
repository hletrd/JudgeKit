# Applicant Review

**Date:** 2026-06-30  
**Scope:** Entire JudgeKit repository, with focus on the recruiting/applicant flow: invitation links, onboarding, consent, exam-taking, anti-cheat telemetry, failure recovery, submission, and results.  
**Persona:** Software-engineering job applicant using a Mac on a Saturday afternoon, stable home WiFi, one shot at a 90-minute coding assessment.  
**Summary:** The recruiting flow is functionally solid (strong tokens, rate limits, server-synced timer, scoped access), but several UX gaps would make a nervous candidate anxious or lose trust: the anti-cheat privacy notice blocks the exam page after the timer has already started, there is no visible "draft saved" indicator, the results page assumes an email address that may not exist, and there is no clear end-of-assessment closure. Some anti-cheat signals (blur, contextmenu) are collected without disclosure and will produce noisy recruiter-facing timelines.

**Findings count:** 15

---

## HIGH: Anti-cheat privacy notice blocks the exam after the timer starts (confidence: High)
- **File**: `src/components/exam/anti-cheat-monitor.tsx` (lines 42-48, 236-239, 244-271, 372-410) and `src/app/(public)/contests/[id]/page.tsx` (lines 217-220)
- **Problem**: `AntiCheatMonitor` is mounted at the top of the participation view. On first visit it renders a blocking modal (`Dialog open={true}` with `disablePointerDismissal`) because `sessionStorage.getItem(\`judgekit_anticheat_notice_${assignmentId}\`) !== "accepted"`. Meanwhile the `CountdownTimer` rendered below it is already ticking. The candidate must read the notice and click "I Understand" while real exam time elapses. All heartbeat and event handlers are gated on `!showPrivacyNotice`, so no telemetry is emitted while the notice is open.
- **Failure scenario**: A careful candidate spends 45 seconds reading the privacy notice. They lose 45 seconds of exam time. The recruiter later sees a 45-second heartbeat gap at the very start of the exam and may interpret it as absence or evasion.
- **Suggested fix**: Move the expanded disclosure and explicit acknowledgment to the pre-start page (`/recruit/[token]`), before `signIn` is called. List the exact data classes (tab switches, copy/paste, IP changes, code snapshots, blur, contextmenu) and require a checkbox/I-understand click before the Start button is enabled. Set the sessionStorage flag at redeem time so the in-exam modal is skipped entirely.
- **Cross-references**: `src/app/(auth)/recruit/[token]/recruit-start-form.tsx` (confirmation dialog), `messages/en.json` (`recruit.reviewNoticeSignals`), `src/components/exam/countdown-timer.tsx`

## HIGH: No visible autosave or code-snapshot indicator (confidence: High)
- **File**: `src/components/problem/problem-submission-form.tsx` (lines 152-220)
- **Problem**: The editor sends periodic code snapshots to `/api/v1/code-snapshots` every 10-60 seconds and persists drafts to both `localStorage` and the server (`useSourceDraft`, `useServerSourceDraft`), but there is no UI indicator telling the candidate this is happening. A candidate whose browser crashes or who accidentally closes the tab has no reason to believe their work is recoverable.
- **Failure scenario**: Candidate's laptop battery dies 40 minutes into the exam. They restart, return to the contest, and the editor initially appears blank (the localStorage draft restores, but there is no "Draft restored" toast unless a server draft was restored). Panic ensues; the candidate may waste time rewriting code that was already saved.
- **Suggested fix**: Add a small, non-intrusive status line near the editor: "Draft saved locally / Last snapshot: HH:MM:SS". Show a "Draft restored" toast whenever a local or server draft is loaded into the editor. The `useServerSourceDraft` hook already accepts an `onRestored` callback; ensure the same is true for localStorage recovery.
- **Cross-references**: `src/hooks/use-source-draft.ts`, `src/hooks/use-server-source-draft.ts`, `src/app/api/v1/code-snapshots/route.ts`, `src/app/api/v1/problems/[id]/draft/route.ts`

## HIGH: Results-page sign-in path assumes an email address that may not exist (confidence: High)
- **File**: `src/lib/assignments/recruiting-invitations.ts` (line 179), `src/app/(auth)/recruit/[token]/results/page.tsx` (lines 104-117), `src/app/(auth)/login/login-form.tsx` (lines 62-71), `messages/en.json` (`recruit.resultsSignInRequiredDescription`)
- **Problem**: `createRecruitingInvitation` makes `candidateEmail` optional (`candidateEmail ?? null`). The results page tells the candidate to "use the recruiting email and account password you set when you started the assessment." If the recruiter did not provide an email, the candidate user has no email address and cannot sign in via the normal login page using an email. The candidate also does not know their auto-generated `nanoid(10)` username. The only reliable recovery path is to return to `/recruit/[token]` and enter their account password there, but the results page does not tell them this.
- **Failure scenario**: Recruiter invites "Candidate A" with only a name and no email. Three days later the candidate visits `/recruit/[token]/results`, is told to sign in, tries their personal email at `/login`, fails, and has no visible recovery path. They conclude the platform lost their results.
- **Suggested fix**: On the results "Sign in required" card, add explicit instructions: "Go back to the assessment start page and enter your account password to access your results." Also display the candidate's username (or a masked version) on the post-start page and in any re-entry password email.
- **Cross-references**: `src/app/(auth)/recruit/[token]/page.tsx` (lines 171-201, re-entry form), `src/lib/auth/config.ts` (lines 252-260, login accepts username or email)

## HIGH: No explicit "you are done" end-of-assessment ceremony (confidence: High)
- **File**: `src/components/exam/countdown-timer.tsx` (lines 56-63, 230-233), `src/app/(public)/contests/[id]/page.tsx` (lines 298-302), `messages/en.json` (`groups.examTimeExpired`)
- **Problem**: When the timer reaches zero, `CountdownTimer` calls `onExpired` and renders a small red "Time expired" label. The contest page shows a generic expired banner. There is no modal or dedicated screen saying "Your assessment is complete. Your best submissions have been recorded. You may close this tab." The candidate is left uncertain about whether their final in-flight submission counted.
- **Failure scenario**: Candidate clicks Submit with 5 seconds remaining. The network is slow and the timer expires while the request is in flight. The page shows "Time expired" but never confirms whether the submission was accepted. The candidate may sit waiting, refresh repeatedly, or contact the recruiter in a panic.
- **Suggested fix**: When `onExpired` fires in a recruiting context, show a dedicated, non-dismissible modal with clear text: "Your assessment time has ended. Your best submission for each problem has been recorded. You may close this tab." If a submission is still pending, show its status and a final timestamp once it resolves.
- **Cross-references**: `src/components/exam/exam-deadline-sync.tsx`, `src/app/api/v1/submissions/[id]/queue-status/route.ts`

## HIGH: No pre-test editor or environment sanity check (confidence: High)
- **File**: `src/app/(auth)/recruit/[token]/page.tsx` (lines 229-346), `src/app/(auth)/recruit/[token]/recruit-start-form.tsx` (lines 149-178)
- **Problem**: The candidate first sees the code editor only after clicking Start and the timer has begun. There is no sample problem, dry-run "Run" button, or editor smoke test before the clock starts. Corporate proxies, browser extensions, or Content Security Policy issues can prevent Monaco/CodeMirror assets from loading.
- **Failure scenario**: Candidate's browser blocks the editor CDN. They click Start, the timer starts, and they see a blank code area. They lose several minutes troubleshooting before they can write any code. Recruiters cannot distinguish this from poor performance.
- **Suggested fix**: Add an optional "Test your setup" step on the pre-start page: a read-only mini editor that loads the same component used in the exam, plus a "Run sample" button that compiles a trivial program. Do not start the timer until the candidate explicitly confirms the editor works.
- **Cross-references**: `src/components/code/code-editor.tsx`, `src/components/problem/problem-submission-form.tsx`

## MEDIUM: Tab-switch grace period is undisclosed (confidence: High)
- **File**: `src/components/exam/anti-cheat-monitor.tsx` (lines 53, 280-284), `messages/en.json` (`contests.antiCheat.privacyNoticeTabSwitch`)
- **Problem**: The code waits `TAB_SWITCH_GRACE_MS = 3000` before logging a `tab_switch` event. The candidate has no idea this grace period exists, so they either avoid all tab switches (hurting performance) or switch freely and are startled by the warning toast.
- **Failure scenario**: Candidate opens `docs.python.org` for 2 seconds to check a function signature. No event is logged. They conclude switching is safe and later stay on a docs tab for 10 seconds, triggering a toast and a logged event, which breaks their concentration.
- **Suggested fix**: Disclose the grace period in the pre-start notice and in the in-exam privacy dialog: "Brief tab switches (under 3 seconds) are not flagged."
- **Cross-references**: `src/app/(auth)/recruit/[token]/page.tsx` (review notice box)

## MEDIUM: `blur` events fire immediately with no disclosure (confidence: High)
- **File**: `src/components/exam/anti-cheat-monitor.tsx` (lines 296-298), `messages/en.json` (`contests.antiCheat.eventTypes.blur`)
- **Problem**: The `blur` event (window loses focus without the tab becoming hidden) is logged immediately, with no grace period and no disclosure. On macOS, common actions like clicking a notification, adjusting volume, or invoking Spotlight generate `blur` events. The `describeElement` function returns `"unknown"` for window blur, so the recruiter gets no context.
- **Failure scenario**: Candidate receives several Slack notifications during the exam and clicks them away. The anti-cheat timeline accumulates 15 `blur` events. The recruiter sees a noisy timeline and cannot distinguish "candidate adjusted system volume" from "candidate opened a chat with a confederate."
- **Suggested fix**: Either add a short grace period for `blur` before logging, or disclose that window-focus changes are logged. Include the active element or a reason string when useful (e.g., "notification clicked"), while respecting privacy.
- **Cross-references**: `src/components/contest/participant-anti-cheat-timeline.tsx`, `src/components/contest/anti-cheat-dashboard.tsx`

## MEDIUM: `contextmenu` events are recorded without disclosure (confidence: High)
- **File**: `src/components/exam/anti-cheat-monitor.tsx` (lines 338-340)
- **Problem**: Right-clicking anywhere in the exam page logs a `contextmenu` event. Candidates routinely right-click in the code editor to access copy/paste/format context menus. This signal is not listed in either the pre-start review notice or the in-exam privacy dialog.
- **Failure scenario**: Candidate uses right-click → Paste to paste a snippet of their own code. The recruiter sees repeated "Right Click" events in the timeline without context and may misinterpret normal editing as suspicious behavior.
- **Suggested fix**: Add `contextmenu` to the disclosed signal list, or stop logging right-clicks inside the code editor. If retained, include the `target` description so recruiters can see it was editor-context-menu usage.
- **Cross-references**: `messages/en.json` (`recruit.reviewNoticeSignals`, `contests.antiCheat.privacyNoticeCopyPaste`)

## MEDIUM: No explicit policy on external language documentation (confidence: Medium)
- **File**: `messages/en.json` (`recruit.noteTimer`, `recruit.noteSubmissions`, `recruit.noteCompletion`, `recruit.reviewNoticeSignals`), `src/app/(auth)/recruit/[token]/page.tsx` (lines 300-319)
- **Problem**: The pre-start page warns about stable connections and multiple submissions, but it never says whether the candidate may open language/stdlib documentation in another tab. Candidates will either self-censor (hurting code quality) or switch freely and be surprised by tab-switch warnings.
- **Failure scenario**: Candidate is unsure whether opening `docs.python.org` is allowed. They avoid it and write a less idiomatic solution, or they open it and then panic when the "tab switch detected" toast appears.
- **Suggested fix**: Add a bullet under "Before you start": "You may reference official language documentation in another tab. Brief tab switches are expected and noted, not disqualifying on their own."
- **Cross-references**: `src/components/exam/anti-cheat-monitor.tsx` (tab-switch logic)

## MEDIUM: Privacy Policy link does not jump to the anti-cheat section (confidence: High)
- **File**: `src/app/(auth)/recruit/[token]/page.tsx` (lines 327-336), `src/app/(public)/privacy/page.tsx` (lines 92-94)
- **Problem**: The pre-start page links to the full Privacy Policy in a new tab. The candidate must scroll through data classes, rights, and contact sections to find the relevant "Anti-cheat telemetry note" near the bottom. Under time pressure, many will not read it.
- **Failure scenario**: Candidate clicks "Privacy Policy" to understand monitoring, sees a long generic page, and closes it without finding the anti-cheat details. They start the exam without informed consent.
- **Suggested fix**: Add an in-page anchor (`#anti-cheat`) to the anti-cheat section and link to `/privacy#anti-cheat`. Consider also including the anti-cheat retention window directly in the pre-start review box.
- **Cross-references**: `messages/en.json` (`recruit.privacy.sectionAntiCheatTitle`)

## MEDIUM: Start confirmation omits duration for fixed-deadline exams (confidence: High)
- **File**: `src/app/(auth)/recruit/[token]/recruit-start-form.tsx` (lines 159-165)
- **Problem**: The confirmation dialog conditionally renders the duration only when `examDurationMinutes` is set: `{examDurationMinutes ? <p>{t("durationDetail", ...)}</p> : null}`. For scheduled/fixed-deadline assessments, the candidate sees no time information in the final confirmation dialog beyond the title.
- **Failure scenario**: Candidate starts a fixed-deadline assessment late in the window. The confirmation dialog does not remind them of the absolute deadline, so they underestimate how little time remains.
- **Suggested fix**: For fixed-deadline exams, show the absolute deadline and remaining time in the confirmation dialog. The parent page already has this data; pass `deadline` into `RecruitStartForm`.
- **Cross-references**: `src/app/(auth)/recruit/[token]/page.tsx` (lines 275-280)

## MEDIUM: No post-assessment feedback channel (confidence: Medium)
- **File**: `src/app/(auth)/recruit/[token]/results/page.tsx` (lines 250-348), `messages/en.json` (`recruit` namespace)
- **Problem**: After the assessment closes and results are visible, there is no "Report a problem" or feedback prompt. Candidates who experienced technical issues have no structured channel to alert the recruiter.
- **Failure scenario**: Candidate's editor briefly failed to load during the exam but they recovered. They want to flag this so the recruiter does not misinterpret a slow start. There is no form or contact prompt on the results page other than the organizer email.
- **Suggested fix**: Add a "Report a technical issue" link or a short feedback form on the results page that emails the configured `recruitingContactEmail` with the assignment and user ID pre-filled.
- **Cross-references**: `src/lib/email/recruiting.ts`

## MEDIUM: Invitation link is not marked as sensitive (confidence: Medium)
- **File**: `src/app/(auth)/recruit/[token]/page.tsx` (lines 229-346)
- **Problem**: The magic link `/recruit/<token>` contains the plaintext token in the URL. The page does not warn the candidate to keep the link private. If the candidate pastes the link into a chat for help, an unredeemed token can be consumed by someone else.
- **Failure scenario**: Candidate forwards the link to a friend asking "Is this legit?" The friend opens it, creates an account, and consumes the single invitation slot.
- **Suggested fix**: Add a short, visible notice: "This link is unique to you. Do not share it with anyone."
- **Cross-references**: `src/lib/assignments/recruiting-invitations.ts` (token generation and redeem logic)

## LOW: Candidate name visible on a token-bearing URL (confidence: Medium)
- **File**: `src/app/(auth)/recruit/[token]/page.tsx` (lines 141-143)
- **Problem**: When `resumeWithCurrentSession` is true, the page greets the candidate by name (`welcome`, `{ name: invitation.candidateName }`). The URL still contains the raw token. On a shared machine, a shoulder-surfer can see both the candidate's name and the token.
- **Failure scenario**: Candidate starts the assessment in a library or co-working space. The greeting displays their full name while the token is visible in the address bar.
- **Suggested fix**: Avoid displaying the full name prominently when the URL contains a sensitive token, or redirect to a token-free route immediately after session creation.
- **Cross-references**: `src/lib/auth/recruiting-token.ts`

## LOW: Auto-generated username is not surfaced to the candidate (confidence: Medium)
- **File**: `src/lib/assignments/recruiting-invitations.ts` (line 725), `src/app/(auth)/recruit/[token]/page.tsx` (lines 327-336), `messages/en.json` (`recruit.accountPasswordHint`)
- **Problem**: The recruiting account is created with a `nanoid(10)` username that is never shown to the candidate. The hint says to use their "recruiting email" to log in, but if no email was set, the username is the only credential identifier they could use.
- **Failure scenario**: Candidate returns to view results after the invitation has expired. They cannot use the magic link and do not know their username. They must rely on the email path, which may not exist.
- **Suggested fix**: Display the username on the post-start page (and re-entry page) with a note: "Save this username if you need to sign in later." Alternatively, require `candidateEmail` for recruiting invitations.
- **Cross-references**: `src/app/(auth)/recruit/[token]/results/page.tsx`

---

## Final sweep

- **Skipped / not inspected in depth**: Full mobile responsiveness audit of the exam split-pane editor (the editor supports fullscreen but was not tested on actual narrow viewports); exact behavior of `useUnsavedChangesGuard` when the privacy modal is open; CSP/Monaco loader failure modes; accessibility audit of the alert dialogs beyond `aria-live` on the timer.
- **Commonly missed issues checked**: Race conditions (redeem uses atomic SQL claim; anti-cheat flush is single-flight; exam session start is idempotent), auth bypass (token hash storage, per-invitation brute-force lockout, IP rate limits), injection (token hash lookup, parameterized queries), secret leakage (token only in URL/history, not logged), disabled tests (none found in recruiting-specific tests), stale comments (none found).
- **Manual validation recommended**: Run the recruiting E2E spec (`tests/e2e/recruiting-invitation.spec.ts`) with `enableAntiCheat: true` and measure the time lost to the privacy notice. Test the results-page flow when `candidateEmail` is omitted. Test a simulated browser crash mid-exam and verify that the localStorage/server draft restoration is surfaced clearly to the candidate.
