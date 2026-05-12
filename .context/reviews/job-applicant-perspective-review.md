# Job Applicant Perspective Review: JudgeKit Recruiting Flow

> Reviewed as a candidate taking a recruitment coding test on the JudgeKit platform.
> Date: 2026-05-10

---

## Executive Summary

JudgeKit's recruiting flow is technically solid in areas like token security, atomic redemption, and server-time deadline enforcement. However, from a candidate's perspective, it has significant friction points, fairness concerns, and missing communication channels that could negatively impact the testing experience and create anxiety during high-stakes assessments. The most critical gaps are: **zero automated email communication**, **anti-cheat false positive risks with no appeal path**, and **opaque results availability**.

---

## Inventory of Reviewed Files

### Candidate-Facing Pages
- `src/app/(auth)/recruit/[token]/page.tsx` — Invitation landing page
- `src/app/(auth)/recruit/[token]/recruit-start-form.tsx` — Start/continue exam form
- `src/app/(auth)/recruit/[token]/results/page.tsx` — Candidate results page
- `src/app/(auth)/recruit/[token]/results/loading.tsx` — Results loading state
- `src/app/(public)/contests/[id]/page.tsx` — Contest/exam participation page
- `src/app/(public)/privacy/page.tsx` — Privacy policy

### Core Logic & API
- `src/lib/assignments/recruiting-invitations.ts` — Token redemption, user creation
- `src/lib/assignments/recruiting-results.ts` — Score computation
- `src/lib/assignments/recruiting-constants.ts` — Expiry computation
- `src/lib/assignments/exam-sessions.ts` — Exam session start/personal deadline
- `src/lib/auth/recruiting-token.ts` — Token authorization
- `src/lib/recruiting/access.ts` — Access context for recruiting candidates
- `src/app/api/v1/recruiting/validate/route.ts` — Token validation endpoint
- `src/app/api/v1/groups/[id]/assignments/[assignmentId]/exam-session/route.ts` — Exam session API
- `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts` — Anti-cheat event logging
- `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/route.ts` — Invitation management

### Components
- `src/components/exam/anti-cheat-monitor.tsx` — Browser monitoring
- `src/components/exam/anti-cheat-storage.ts` — Pending event queue
- `src/components/exam/countdown-timer.tsx` — Exam countdown
- `src/components/exam/start-exam-button.tsx` — Exam start button
- `src/components/problem/problem-submission-form.tsx` — Code submission form
- `src/components/code/code-editor.tsx` — Code editor component
- `src/components/contest/contest-clarifications.tsx` — Q&A during exam
- `src/components/contest/recruiting-invitations-panel.tsx` — Recruiter invitation UI (reviewed for contrast)
- `src/components/contest/recruiter-candidates-panel.tsx` — Recruiter candidate view (reviewed for contrast)

### Hooks & Utilities
- `src/hooks/use-source-draft.ts` — Auto-save draft logic
- `src/lib/data-retention.ts` — Data retention periods
- `src/lib/anti-cheat/review-model.ts` — Event tier classification
- `src/lib/audit/events.ts` — Audit event logging

### Localization
- `messages/en.json` — Recruit section (lines ~2677-2792)
- `messages/ko.json` — Recruit section (Korean translations)

### Schema
- `src/lib/db/schema.pg.ts` — `recruitingInvitations`, `examSessions`, `antiCheatEvents`, `codeSnapshots`

---

## Detailed Findings

---

### 1. Invitation Flow

#### 1.1 No Automated Email Communication (CRITICAL)
**File:** `src/lib/assignments/recruiting-invitations.ts:157-185` (createRecruitingInvitation)
**Impact:** Candidates receive their invitation link only through whatever channel the recruiter manually uses. There is zero email infrastructure in the recruiting flow. The `candidateEmail` field is stored in the database but never used to send any communication.
**Candidate Impact:** If a recruiter copy-pastes the link incorrectly, or sends it via an unreliable channel (Slack DM, text message), the candidate may never receive it. No confirmation email means candidates cannot verify they were invited. No reminder emails mean candidates may forget about the assessment.
**Severity:** CRITICAL
**Fix:** Integrate an email provider (SMTP, SendGrid, etc.) to send: (a) invitation email with secure link, (b) reminder emails before expiry/deadline, (c) deadline approaching warnings.

#### 1.2 Rate Limiting May Block Legitimate Candidates on Shared Networks
**File:** `src/app/(auth)/recruit/[token]/page.tsx:86-91`
**Impact:** The token lookup is rate-limited to 30 requests per 60 seconds per IP. On corporate networks, university dormitories, or shared office WiFi, multiple candidates may share the same public IP.
**Candidate Impact:** A candidate clicking their invitation link could see "Invalid link" (the rate-limited response is indistinguishable from an actual invalid token) simply because another candidate on the same network clicked theirs. The error message gives no indication that rate limiting is the cause.
**Severity:** HIGH
**Fix:** Use a higher, per-token rate limit instead of per-IP for the recruiting validation endpoint. Alternatively, show a specific "too many requests" message with a retry suggestion.

#### 1.3 Token Lockout After 5 Failed Attempts with No Self-Recovery
**File:** `src/lib/assignments/recruiting-invitations.ts:512-514`
**Impact:** After 5 failed password attempts during re-entry, the token is permanently locked (`tokenLocked`). The only resolution path is contacting the recruiter for a new invitation.
**Candidate Impact:** A candidate who fat-fingers their password 5 times (or has auto-fill issues) is permanently locked out with no "forgot password" or cooldown mechanism. The error message says "Contact the organizer for a new one" — this creates unnecessary work for both candidate and recruiter.
**Severity:** HIGH
**Fix:** Implement a time-based cooldown instead of permanent lockout (e.g., lock for 1 hour after 5 attempts, with exponential backoff). Or provide a "request unlock" flow that sends an email to the recruiter.

#### 1.4 No Visual Expiry Warning on Invitation Page
**File:** `src/app/(auth)/recruit/[token]/page.tsx:119-127`
**Impact:** If an invitation expires while the candidate is viewing the page (e.g., they left the tab open), the page does not auto-refresh or warn them. The "Start Assessment" button remains clickable.
**Candidate Impact:** A candidate could fill in their password, click start, and only then discover the invitation has expired — wasting their time and creating frustration.
**Severity:** MEDIUM
**Fix:** Add a client-side countdown to the invitation expiry on the landing page, or disable the start button with a warning when expiry is near.

#### 1.5 No Indication of How Many Attempts Remain Before Lockout
**File:** `src/lib/assignments/recruiting-invitations.ts:512-514`
**Impact:** The failed attempt counter is stored in metadata but never exposed to the candidate.
**Candidate Impact:** Candidates have no warning that they are approaching permanent lockout. This is especially stressful during high-stakes recruiting.
**Severity:** MEDIUM
**Fix:** Show a warning after 3 failed attempts: "2 attempts remaining before this link is locked."

---

### 2. Registration Friction

#### 2.1 No SSO or Social Login for Recruiting Candidates
**File:** `src/app/(auth)/recruit/[token]/recruit-start-form.tsx:80-84`
**Impact:** Recruiting flow only supports credentials-based login (password created at invitation time). OAuth/Google/GitHub login is not available.
**Candidate Impact:** Candidates must remember yet another password. In an era where most platforms offer SSO, this feels archaic and creates friction. Candidates who use password managers may still need to manually create and save a new credential.
**Severity:** HIGH
**Fix:** Allow OAuth login for recruiting candidates. If a candidate signs in via OAuth, link their existing account to the recruiting invitation instead of creating a new password-based user.

#### 2.2 Auto-Generated Username is Impersonal and Confusing
**File:** `src/lib/assignments/recruiting-invitations.ts:649`
**Impact:** Username is `nanoid(10)`, a random alphanumeric string like `aB3xK9mP2q`.
**Candidate Impact:** Candidates see this gibberish username in various places (submissions, leaderboard if visible, profile). It feels dehumanizing and makes it hard to identify their own account. The comment says "display-only" but it still appears in URLs and potentially on screen.
**Severity:** MEDIUM
**Fix:** Generate a human-readable username from the candidate name (e.g., slugify with random suffix: `john-doe-a3x9`). Or use email-based login exclusively and hide the username from candidate-facing UI.

#### 2.3 No Email Verification for Recruiting Accounts
**File:** `src/lib/assignments/recruiting-invitations.ts:662-670`
**Impact:** When a recruiting account is created, the email address (if provided) is stored without any verification.
**Candidate Impact:** If the recruiter made a typo in the email, the candidate will never know. The "sign in later with your recruiting email" flow will fail, and the candidate has no way to recover since they never verified the address.
**Severity:** MEDIUM
**Fix:** Send a verification email on first redemption. Allow candidates to correct their email if verification fails.

#### 2.4 Password Reset Requires Recruiter Intervention
**File:** `src/lib/assignments/recruiting-invitations.ts:387-436` (resetRecruitingInvitationAccountPassword)
**Impact:** If a candidate forgets their password, the recruiter must manually trigger a reset from the admin panel. There is no self-service password reset.
**Candidate Impact:** A candidate locked out of their account must email the recruiter, wait for a response, then go through a special reset flow. This adds hours or days of delay, especially problematic near deadlines.
**Severity:** HIGH
**Fix:** Implement a self-service password reset using the verified email address. Send a time-limited reset link.

#### 2.5 No Option to Link to Existing Platform Account
**File:** `src/lib/assignments/recruiting-invitations.ts:472-751` (redeemRecruitingToken)
**Impact:** Each recruiting invitation creates a brand new user account. There is no way for a candidate who already has a JudgeKit account to link their invitation to their existing account.
**Candidate Impact:** Candidates with existing accounts must juggle multiple logins. Their practice history, preferences, and profile are siloed from their recruiting identity.
**Severity:** MEDIUM
**Fix:** During redemption, detect if the candidate email matches an existing user and offer to link the invitation to that account.

---

### 3. Test Environment Clarity

#### 3.1 No Preview of Problem Difficulty Before Starting Timer
**File:** `src/app/(auth)/recruit/[token]/page.tsx:212-225`
**Impact:** The invitation page shows problem count and language list, but not the difficulty distribution or types of problems.
**Candidate Impact:** Candidates start the timer with no idea whether they are facing 3 easy problems or 1 impossible one. This creates anxiety and poor time allocation.
**Severity:** MEDIUM
**Fix:** Show a difficulty breakdown (e.g., "1 Easy, 1 Medium, 1 Hard") or at least the problem titles with difficulty badges before the timer starts.

#### 3.2 Scoring Model Not Explained to Candidates
**File:** `src/app/(public)/contests/[id]/page.tsx:236-238`
**Impact:** The contest page shows ICPC vs IOI scoring badges, but there is no explanation of what these mean for candidates who are not competitive programmers.
**Candidate Impact:** A typical job applicant may not know that "ICPC" means "pass/fail per problem with time penalty" while "IOI" means "partial scoring per test case." This affects their strategy.
**Severity:** MEDIUM
**Fix:** Add a tooltip or expandable section explaining the scoring model in plain language: "Each problem is worth X points. You get partial credit for partially correct solutions." vs "Each problem is all-or-nothing. Wrong answers incur a time penalty."

#### 3.3 No Sample/Test Run Before Timer Starts
**File:** `src/components/exam/start-exam-button.tsx:25-84`
**Impact:** The "Start Exam" dialog only confirms duration. There is no opportunity to test the editor, run a sample program, or verify the environment.
**Candidate Impact:** Candidates may discover after starting the timer that their preferred language is not configured correctly, the editor keybindings don't work for them, or the run button is slow. These issues then eat into their timed assessment.
**Severity:** MEDIUM
**Fix:** Add a "Test Environment" button on the invitation page that opens a sandboxed code editor (no timer, no submission) so candidates can verify everything works.

#### 3.4 Good: Clear Pre-Start Disclaimers
**File:** `src/app/(auth)/recruit/[token]/page.tsx:298-315`
**Impact:** The invitation page shows three notice boxes: Important Notes (timer rules), Assessment Review Notice (monitoring disclosure), and Resume Session Notice.
**Candidate Impact:** Candidates are clearly informed about monitoring, the no-pause rule, and review practices before committing.
**Severity:** (Positive finding — LOW severity concern addressed well)

---

### 4. Anti-Cheat During Recruiting

#### 4.1 Tab Switch Detection Has High False Positive Risk (HIGH)
**File:** `src/components/exam/anti-cheat-monitor.tsx:206-216`
**Impact:** Any tab switch is logged as a "tab_switch" event, including: switching to documentation, looking up language syntax, checking email from the recruiter, or a browser extension opening a popup.
**Candidate Impact:** A candidate who switches to MDN to check JavaScript array methods gets flagged. A candidate whose password manager auto-fills from a popup gets flagged. These are normal, non-cheating behaviors that become "signals" in the recruiter's dashboard.
**Severity:** HIGH
**Fix:** Distinguish between "switched to another tab" and "switched to a known disallowed domain." At minimum, document to candidates what is and is not allowed. Better: whitelist common reference sites (docs.python.org, cppreference.com, etc.) or provide an in-app reference panel.

#### 4.2 Copy/Paste Detection Cannot Distinguish Source
**File:** `src/components/exam/anti-cheat-monitor.tsx:245-259`
**Impact:** Copy and paste events are logged with the target element description, but there is no way to tell if the candidate copied from the problem description (allowed) vs. from Stack Overflow (not allowed).
**Candidate Impact:** Copying example code from the problem statement — a completely normal action — generates the same "copy" event as copying from an external source. The recruiter sees "copy: code-block" which looks suspicious.
**Severity:** HIGH
**Fix:** Do not log copy/paste events when the target is within the problem description or code editor itself. Only flag when the target is the code editor AND the paste operation occurs shortly after a window blur/tab switch.

#### 4.3 Heartbeat Gap Detection Penalizes Network Issues and Sleep Mode
**File:** `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:192-228`
**Impact:** Heartbeat gaps >120 seconds are flagged. This can happen due to: laptop sleep, network outage, browser background throttling, or the user stepping away briefly.
**Candidate Impact:** A candidate whose WiFi drops for 3 minutes gets an "escalate" tier flag. A candidate who closes their laptop lid for a bathroom break gets flagged. These are not cheating behaviors.
**Severity:** HIGH
**Fix:** Increase the gap threshold (e.g., 5 minutes) and require multiple gaps or other corroborating signals before escalation. Allow candidates to proactively pause/resume with a reason (e.g., "network issue — resuming now").

#### 4.4 Context Menu (Right-Click) Blocked Without Explanation
**File:** `src/components/exam/anti-cheat-monitor.tsx:257-259`
**Impact:** Right-clicking anywhere in the exam triggers an anti-cheat event. Many users right-click to spell-check, inspect element, or use browser features.
**Candidate Impact:** Candidates may not realize right-click is monitored. A habitual right-click to "Search Google for..." or "Inspect" generates a signal. There is no explanation of what right-click restriction means.
**Severity:** MEDIUM
**Fix:** Either disable the contextmenu event listener (it is trivially bypassed anyway) or explicitly tell candidates in the privacy notice that right-click is monitored and why.

#### 4.5 No Appeal or Explanation Process for Candidates
**File:** (Not found — no candidate-facing anti-cheat explanation exists beyond the privacy notice)
**Impact:** If anti-cheat flags are raised, candidates have no way to see them, explain them, or appeal them.
**Candidate Impact:** A candidate may be rejected from a job because of a "tab_switch" event they don't even know occurred (e.g., a system notification caused it). They have no recourse.
**Severity:** CRITICAL
**Fix:** Provide a candidate-facing "Anti-cheat Activity Log" showing what was recorded and why. Allow candidates to add explanatory notes (e.g., "Switched tab to check recruiter email at 14:32").

#### 4.6 Good: Privacy Notice Required Before Monitoring Begins
**File:** `src/components/exam/anti-cheat-monitor.tsx:289-324`
**Impact:** Candidates must explicitly accept a privacy notice before anti-cheat monitoring activates.
**Candidate Impact:** Transparency about what is monitored. The notice lists tab switches, copy/paste, IP address, and code snapshots.
**Severity:** (Positive finding — addresses a major privacy concern)

---

### 5. Submission Confidence

#### 5.1 Good: 4-Second Cancel Window Prevents Accidental Submission
**File:** `src/components/problem/problem-submission-form.tsx:242-334`
**Impact:** Submitting code triggers a 4-second toast with a cancel option before the actual POST.
**Candidate Impact:** Accidental Ctrl+Enter presses can be cancelled. This is excellent UX for high-stakes timed tests.
**Severity:** (Positive finding)

#### 5.2 Good: Local Auto-Save with 7-Day Draft Persistence
**File:** `src/hooks/use-source-draft.ts:1-430`
**Impact:** Code is auto-saved to localStorage with 500ms debounce, 7-day TTL, and pagehide/visibilitychange flushing.
**Candidate Impact:** Browser crashes, accidental refreshes, or network issues do not lose code. Drafts persist across sessions.
**Severity:** (Positive finding)

#### 5.3 Good: Server-Side Code Snapshots During Exam
**File:** `src/components/problem/problem-submission-form.tsx:118-143`
**Impact:** Code snapshots are sent to the server every 10-60 seconds during exams.
**Candidate Impact:** Even if localStorage is cleared or the candidate switches devices, their code progress is recoverable by admins.
**Severity:** (Positive finding — though see privacy concerns in section 4)

#### 5.4 No Explicit "Review All Problems Before Final Submit" Flow
**File:** `src/app/(public)/contests/[id]/page.tsx:310-416`
**Impact:** The contest page shows all problems in an AssignmentOverview, but there is no explicit final review step or "Are you sure you want to finish?" confirmation.
**Candidate Impact:** A candidate might submit their last problem and assume the exam is over, not realizing they have time to review previous submissions. Or they might accidentally navigate away thinking they are done.
**Severity:** MEDIUM
**Fix:** Add a "Finish Assessment" button that shows a review modal: "You have submitted solutions for X/Y problems. Your highest-scoring submission for each problem will be counted. Time remaining: Z minutes. Finish now or continue?"

---

### 6. Results Transparency

#### 6.1 Results Visibility Controlled Entirely by Recruiter (CRITICAL)
**File:** `src/app/(auth)/recruit/[token]/results/page.tsx:167-181`
**Impact:** Results are only shown if `showResultsToCandidate = true` AND the deadline has passed. Scores can be hidden via `hideScoresFromCandidates`.
**Candidate Impact:** Candidates have zero visibility into whether they will ever see results. A recruiter can keep results hidden indefinitely. The message "The recruiter has not enabled candidate-visible results" is passive-aggressive and unhelpful — it tells candidates to "reach out via contact below" but provides no guarantee of response.
**Severity:** CRITICAL
**Fix:** Guarantee minimum results transparency: always show submission status (attempted/solved) even if scores are hidden. Show a "results will be available by [date]" message based on the deadline. If the recruiter disables results after the fact, show an explanation, not a blank rejection.

#### 6.2 No Feedback on Wrong Answers
**File:** `src/app/(auth)/recruit/[token]/results/page.tsx:318-325`
**Impact:** The results page shows verdict badges (Accepted, Wrong Answer, etc.) but no test case feedback, no hint about what went wrong, and no comparison of expected vs actual output.
**Candidate Impact:** Candidates learn nothing from failed submissions. In a learning context this would be fine, but in recruiting it means candidates cannot self-assess their weak areas. They see "Wrong Answer" with no explanation.
**Severity:** HIGH
**Fix:** Show the number of passed test cases (e.g., "Passed 3/10 test cases") without revealing the actual test data. This gives meaningful feedback without compromising problem integrity.

#### 6.3 Results Page Requires Active Session Matching Invitation
**File:** `src/app/(auth)/recruit/[token]/results/page.tsx:104-117`
**Impact:** The results page checks that the current session user matches the invitation's userId. If the session expired, the candidate is shown "Sign in to see your results."
**Candidate Impact:** Session expiry is common (JWT refresh cycles, browser restarts). A candidate returning to check results after the weekend may find themselves locked out with a generic sign-in prompt. The password they created was for a one-time recruiting account they may not remember.
**Severity:** HIGH
**Fix:** Extend session duration for recruiting candidates. Send a "results ready" email with a magic link that authenticates and redirects to results directly.

---

### 7. Accessibility

#### 7.1 Timer Color Changes Problematic for Colorblind Users
**File:** `src/components/exam/countdown-timer.tsx:18-31`
**Impact:** The timer uses color coding: green (>30 min), yellow (15-30 min), red (<5 min), plus pulsing animation at <1 min.
**Candidate Impact:** Colorblind candidates (especially red-green) cannot distinguish the urgency levels. The pulsing animation is the only non-color cue, and it only appears in the final minute.
**Severity:** HIGH
**Fix:** Add explicit text indicators alongside colors: "30+ min remaining", "15 min remaining", "5 min remaining — URGENT". Use icons (clock, warning triangle) in addition to color.

#### 7.2 Code Editor Fullscreen Mode Missing Focus Trap
**File:** `src/components/code/code-editor.tsx:40-52`
**Impact:** Fullscreen mode is toggled via a button but there is no focus trap. Tab navigation can exit the fullscreen editor.
**Candidate Impact:** Keyboard-only users may accidentally tab out of the fullscreen editor and lose their place. The Escape key exits fullscreen but this is not announced to screen readers.
**Severity:** MEDIUM
**Fix:** Implement a focus trap in fullscreen mode. Announce "Fullscreen mode activated, press Escape to exit" via aria-live.

#### 7.3 Anti-Cheat Privacy Notice Dialog Not Announced to Screen Readers
**File:** `src/components/exam/anti-cheat-monitor.tsx:289-324`
**Impact:** The Dialog component is used but there is no `aria-describedby` linking to the detailed list of monitored behaviors.
**Candidate Impact:** Screen reader users hear the dialog title but may miss the critical list of what is being monitored (tab switches, copy/paste, IP logging).
**Severity:** MEDIUM
**Fix:** Add `aria-describedby` on the Dialog pointing to the list of monitored behaviors. Ensure the accept button has clear focus indication.

---

### 8. Fairness

#### 8.1 No Grace Period for Network Issues During Submission
**File:** `src/components/problem/problem-submission-form.tsx:258-304`
**Impact:** If the network drops during the `apiFetch` call to `/api/v1/submissions`, the submission fails with a generic error toast.
**Candidate Impact:** A candidate with an unstable connection may lose a submission attempt or waste time re-submitting. In a timed exam, this is especially unfair.
**Severity:** HIGH
**Fix:** Implement automatic retry with exponential backoff for submission POSTs. Show a "Retrying..." indicator instead of an immediate error. Queue submissions offline and sync when connection returns.

#### 8.2 No Browser Compatibility Check
**File:** (Not found — no compatibility check exists)
**Impact:** There is no check for browser version, JavaScript support, or required features before the exam starts.
**Candidate Impact:** Candidates using older browsers, corporate-locked-down machines, or mobile devices may encounter silent failures (e.g., CodeMirror not rendering, localStorage disabled, anti-cheat APIs failing).
**Severity:** MEDIUM
**Fix:** Add a pre-flight compatibility check that verifies: localStorage access, JavaScript enabled, modern browser (Chrome/Firefox/Edge/Safari recent versions), screen size adequate for code editor, and warns about mobile devices.

#### 8.3 No "Save and Exit" for Windowed Exams
**File:** `src/lib/assignments/exam-sessions.ts:21-123`
**Impact:** Once an exam session starts, the personal deadline is fixed. There is no way to pause, save progress, and resume later within the window.
**Candidate Impact:** A candidate who experiences a family emergency, power outage, or mandatory meeting must let the timer run down. Their personal deadline does not pause.
**Severity:** MEDIUM
**Fix:** Allow candidates to pause the exam up to N times for a total of M minutes, with the pause reason logged for recruiter review. Or at minimum, allow "save and exit" that preserves the remaining time for re-entry.

#### 8.4 Good: Server Time Sync for Countdown Prevents Clock Skew
**File:** `src/components/exam/countdown-timer.tsx:79-106`
**Impact:** The countdown timer fetches `/api/v1/time` on mount and computes an offset to correct for client clock drift.
**Candidate Impact:** Candidates with incorrect system clocks still see an accurate countdown. The timer also recalculates when the tab regains visibility to correct for background throttling.
**Severity:** (Positive finding)

#### 8.5 Good: DB Server Time Used for All Deadline Checks
**File:** `src/lib/assignments/exam-sessions.ts:52-63`, `src/lib/assignments/recruiting-invitations.ts:482-483`
**Impact:** All expiry and deadline comparisons use `NOW()` from the database server, not the client or app server clock.
**Candidate Impact:** Eliminates timezone confusion and clock skew issues. A candidate in a different timezone sees the same authoritative deadline.
**Severity:** (Positive finding)

---

### 9. Communication

#### 9.1 Zero Automated Emails to Candidates (CRITICAL)
**File:** Entire recruiting flow — no email sending infrastructure exists.
**Impact:** No invitation email, no reminder email, no "assessment starting soon" notification, no "results ready" email, no "deadline approaching" warning.
**Candidate Impact:** Candidates must entirely self-manage their assessment lifecycle. They may forget about the invitation, miss the deadline, or not know when results are available. This is the single biggest gap in the candidate experience.
**Severity:** CRITICAL
**Fix:** Implement email notifications at minimum for: (1) invitation sent, (2) 24-hour reminder before expiry, (3) results available, (4) deadline approaching (24h, 1h). Use the stored `candidateEmail` field.

#### 9.2 No In-Exam Announcement Channel
**File:** `src/components/contest/contest-announcements.tsx` (instructor-facing, not shown to candidates during recruiting)
**Impact:** Contest announcements exist but are not integrated into the recruiting candidate's exam view in a prominent way.
**Candidate Impact:** If a problem is found to be buggy during the exam, or the deadline is extended, candidates have no way to be notified in real-time within the exam interface.
**Severity:** MEDIUM
**Fix:** Ensure announcements are prominently displayed at the top of the exam page for recruiting candidates, with toast notifications for new announcements.

#### 9.3 Clarification Response Time Not Communicated
**File:** `src/components/contest/contest-clarifications.tsx:48-315`
**Impact:** Candidates can ask clarifications but there is no SLA or expected response time communicated.
**Candidate Impact:** A candidate waiting for clarification about ambiguous problem wording wastes precious exam time. They don't know if they should proceed assuming an interpretation or wait for a response.
**Severity:** MEDIUM
**Fix:** Add a message: "Clarifications are typically answered within X minutes during business hours. If your question is urgent, consider your best interpretation and proceed."

---

### 10. Edge Cases

#### 10.1 Invitation Revoked While Candidate is in Exam
**File:** `src/lib/assignments/recruiting-invitations.ts:324-382`
**Impact:** The `updateRecruitingInvitation` function allows revoking pending invitations, but there is no check for candidates currently in an active exam session.
**Candidate Impact:** A recruiter could accidentally revoke an invitation while the candidate is actively taking the exam. The candidate's session is not terminated, but their ability to re-enter is destroyed. This could strand their work.
**Severity:** MEDIUM
**Fix:** Block revocation if the invitation has an active exam session. Show a warning: "This candidate is currently in the exam. Revoking will prevent re-entry."

#### 10.2 Assignment Deleted While Candidate Has Active Session
**File:** `src/lib/db/schema.pg.ts:948-950`
**Impact:** The `recruitingInvitations` table has `onDelete: "cascade"` for the assignment reference. If an assignment is deleted, all associated invitations are deleted.
**Candidate Impact:** A candidate in the middle of an exam could have their invitation (and thus their identity link) deleted if an admin deletes the assignment. Their exam session and submissions remain but they can no longer access results.
**Severity:** MEDIUM
**Fix:** Soft-delete assignments instead of hard delete, or block deletion if active exam sessions exist.

#### 10.3 LocalStorage Quota Exceeded Loses Drafts Silently
**File:** `src/hooks/use-source-draft.ts:286-287`
**Impact:** If localStorage is full (common in private browsing mode or with many extensions), draft saves silently fail.
**Candidate Impact:** A candidate in private browsing mode may lose all their code if the browser tab crashes. The error is swallowed with `/* localStorage unavailable */`.
**Severity:** MEDIUM
**Fix:** Warn the candidate if localStorage is unavailable: "Warning: auto-save is disabled. Use the Run button frequently to preserve your work." Also, increase the snapshot frequency when localStorage fails.

#### 10.4 Mobile Browser Not Blocked or Warned
**File:** (Not found — no mobile detection)
**Impact:** Candidates can attempt the exam on mobile devices. The code editor and split-pane layout are not designed for small screens.
**Candidate Impact:** A candidate who only has a phone available will have a severely degraded experience. They may not realize until they are in the exam.
**Severity:** MEDIUM
**Fix:** Detect mobile devices on the invitation page and show a warning: "This assessment is designed for desktop browsers. Please use a laptop or desktop computer for the best experience."

---

## Summary Table

| # | Finding | Severity | File |
|---|---------|----------|------|
| 1.1 | No automated email communication | CRITICAL | `recruiting-invitations.ts` |
| 1.2 | IP-based rate limiting blocks shared networks | HIGH | `page.tsx:86-91` |
| 1.3 | 5-attempt permanent lockout, no self-recovery | HIGH | `recruiting-invitations.ts:512-514` |
| 2.1 | No SSO/social login for recruiting | HIGH | `recruit-start-form.tsx` |
| 2.4 | Password reset requires recruiter intervention | HIGH | `recruiting-invitations.ts:387-436` |
| 4.1 | Tab switch detection high false positive rate | HIGH | `anti-cheat-monitor.tsx:206-216` |
| 4.2 | Copy/paste cannot distinguish allowed vs disallowed | HIGH | `anti-cheat-monitor.tsx:245-259` |
| 4.3 | Heartbeat gaps flag network issues as cheating | HIGH | `anti-cheat/route.ts:192-228` |
| 4.5 | No appeal/explanation process for anti-cheat flags | CRITICAL | (missing) |
| 6.1 | Results visibility entirely recruiter-controlled | CRITICAL | `results/page.tsx:167-181` |
| 6.3 | Results require active session, no magic link | HIGH | `results/page.tsx:104-117` |
| 7.1 | Timer colors inaccessible for colorblind | HIGH | `countdown-timer.tsx:18-31` |
| 8.1 | No network grace period for submissions | HIGH | `problem-submission-form.tsx` |
| 9.1 | Zero automated emails (reiteration) | CRITICAL | (entire flow) |
| 1.4 | No expiry warning on invitation page | MEDIUM | `page.tsx:119-127` |
| 2.2 | Auto-generated username is impersonal | MEDIUM | `recruiting-invitations.ts:649` |
| 2.3 | No email verification | MEDIUM | `recruiting-invitations.ts:662-670` |
| 2.5 | No linking to existing accounts | MEDIUM | `recruiting-invitations.ts:472-751` |
| 3.1 | No problem difficulty preview | MEDIUM | `page.tsx:212-225` |
| 3.2 | Scoring model not explained | MEDIUM | `contests/[id]/page.tsx:236-238` |
| 3.3 | No test run before timer | MEDIUM | `start-exam-button.tsx` |
| 4.4 | Context menu blocked without explanation | MEDIUM | `anti-cheat-monitor.tsx:257-259` |
| 5.4 | No final review before finishing | MEDIUM | `contests/[id]/page.tsx:310-416` |
| 6.2 | No feedback on wrong answers | HIGH | `results/page.tsx:318-325` |
| 7.2 | Fullscreen editor missing focus trap | MEDIUM | `code-editor.tsx:40-52` |
| 7.3 | Anti-cheat notice lacks screen reader detail | MEDIUM | `anti-cheat-monitor.tsx:289-324` |
| 8.2 | No browser compatibility check | MEDIUM | (missing) |
| 8.3 | No save-and-exit for windowed exams | MEDIUM | `exam-sessions.ts:21-123` |
| 9.2 | No in-exam announcement channel | MEDIUM | `contest-announcements.tsx` |
| 9.3 | Clarification SLA not communicated | MEDIUM | `contest-clarifications.tsx` |
| 10.1 | Revocation while in exam not blocked | MEDIUM | `recruiting-invitations.ts:324-382` |
| 10.2 | Assignment deletion cascades to invitations | MEDIUM | `schema.pg.ts:948-950` |
| 10.3 | localStorage quota failures silent | MEDIUM | `use-source-draft.ts:286-287` |
| 10.4 | Mobile not warned/blocked | MEDIUM | (missing) |

---

## Positive Findings (What's Working Well)

1. **Atomic token redemption** prevents double-claiming and race conditions (`recruiting-invitations.ts:689-721`).
2. **Server-time deadline enforcement** eliminates client clock manipulation (`exam-sessions.ts:52-63`).
3. **4-second submission cancel window** prevents accidental submits (`problem-submission-form.tsx:242-334`).
4. **Local auto-save with server snapshots** provides robust code preservation (`use-source-draft.ts`, `problem-submission-form.tsx:118-143`).
5. **Privacy notice required before monitoring** is transparent and legally defensible (`anti-cheat-monitor.tsx:289-324`).
6. **Brute-force protection** with per-invitation counters adds security (`recruiting-invitations.ts:95-114`).
7. **Re-entry flow for redeemed tokens** means candidates can return using their password (`page.tsx:169-198`).
8. **Results page shows per-problem breakdown** with submission details, not just a raw score (`results/page.tsx:286-337`).
9. **Anti-cheat signals labeled as "review aids only"** with explicit corroboration requirement reduces false conviction risk (`page.tsx:308-315`).
10. **Korean text respects default letter spacing** per CLAUDE.md typography rules (seen throughout i18n and components).

---

## Recommendations Priority

### Immediate (P0 — Blocks or Severely Harms Applications)
1. Implement automated email notifications (invitation, reminder, results-ready).
2. Add candidate-facing anti-cheat activity log with appeal notes.
3. Guarantee minimum results transparency (show attempted/solved status even if scores hidden).
4. Replace permanent 5-attempt lockout with time-based cooldown.

### Short-term (P1 — Significant Friction)
5. Add SSO/OAuth support for recruiting login.
6. Implement self-service password reset via email.
7. Distinguish copy/paste sources (ignore problem-description copies).
8. Increase heartbeat gap threshold and require corroboration.
9. Add colorblind-accessible timer indicators.
10. Add network retry for submissions with offline queueing.

### Medium-term (P2 — Quality of Life)
11. Show problem difficulty preview before timer starts.
12. Add browser compatibility pre-flight check.
13. Add mobile device warning.
14. Implement exam pause/resume with logged reasons.
15. Generate human-readable usernames from candidate names.
16. Add explicit final review modal before finishing exam.
17. Provide test-run sandbox before timer starts.
18. Explain scoring models in plain language to candidates.
