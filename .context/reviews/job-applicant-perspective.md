# Job Applicant Perspective Review

**Reviewer role**: Senior engineer who has completed 10+ coding assessments on HackerRank, LeetCode, CodeSignal, Codility, and similar platforms.

**Date**: 2026-05-04

---

## Executive Summary

JudgeKit's recruiting flow is technically solid with strong security fundamentals (token hashing, rate limiting, brute-force protection, CSRF guards) and a clean UI powered by shadcn/ui. However, the candidate experience has several sharp edges that would shake my confidence in a company using it -- most critically, the complete absence of self-service password recovery and the lack of a password confirmation field during account creation. A single typo when setting your password means you are locked out until a recruiter manually resets it. Compared to HackerRank or CodeSignal, the platform feels like a well-engineered backend with the candidate-facing polish still catching up.

---

## Critical Issues

### 1. No Password Confirmation Field -- Typo = Lockout

**File**: `src/app/(auth)/recruit/[token]/recruit-start-form.tsx` (lines 117-131)

The password creation form has exactly one input field. There is no "confirm password" field. If a candidate types `Str0ngP@ss` but accidentally hits an extra key (`Str0ngP@ss1`), they create an account with a password they do not know. Combined with the absence of self-service recovery (see below), this is a lockout trap.

**Impact**: High. This is the single most likely source of candidate support tickets.

**Fix**: Add a confirmation password field with client-side match validation before enabling the Start button.

### 2. No Self-Service Password Recovery

**Files**: `src/lib/assignments/recruiting-invitations.ts` (lines 380-429), `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/[invitationId]/route.ts`

Password reset for recruiting candidates is an admin-only action (`resetRecruitingInvitationAccountPassword`). There is no "forgot password" link, no email-based recovery, no self-service mechanism at all. If a candidate forgets their password or mistyped it during creation, they must contact the recruiter and wait.

On HackerRank or CodeSignal, you click "Forgot password", get an email, and are back in 60 seconds. On JudgeKit, you send an email and wait hours (or days, if it is a weekend).

**Impact**: Critical. Every other platform in this space has self-service recovery. Its absence feels amateur.

**Fix**: Implement a time-limited, single-use password reset link that the candidate can request from the login page. The link should be emailed to the `candidateEmail` stored on the invitation.

### 3. Token Lockout After 5 Failed Attempts -- No Self-Service Recovery

**File**: `src/lib/assignments/recruiting-invitations.ts` (lines 88-107, 498-508)

After 5 failed password attempts, the invitation token is permanently locked. The error message (`tokenLocked`) tells the candidate to "Contact the organizer for a new one." There is no self-service unlock, no cooldown period, no automatic reset. Five attempts is also quite aggressive -- a candidate who steps away and comes back, or who has Caps Lock on, can burn through them quickly.

The counter does reset on successful auth (good), but the threshold is low and the consequence is severe.

**Impact**: High. Combined with the lack of password confirmation, this creates a high probability of lockout.

**Fix**: Increase the threshold to 10, implement a cooldown period (e.g., 15 minutes after 5 failures), and/or provide a self-service unlock mechanism.

### 4. Review Notice Is Intimidating and Vague

**File**: `src/app/(auth)/recruit/[token]/page.tsx` (lines 298-315)

The landing page shows a prominent amber warning box listing five bullet points about review procedures, including "AI help is unavailable" and "code-similarity checks compare structure across this platform's submissions." This reads more like a legal disclaimer than an assessment brief. For a candidate who is already nervous, this is anxiety-inducing without being actionable.

Compare this to CodeSignal's approach: a brief, friendly "This is a proctored assessment" notice with a link to detailed policies. JudgeKit front-loads the legalese.

**Impact**: Medium. It sets a adversarial tone before the candidate has even started.

**Fix**: Condense the notice to 1-2 sentences with a "Learn more" expandable section. Move the detailed bullet points to a linked policy page.

### 5. Anti-Cheat Privacy Dialog Blocks the Entire Exam

**File**: `src/components/exam/anti-cheat-monitor.tsx` (lines 274-299)

When anti-cheat is enabled, a modal dialog appears that cannot be dismissed (the `onOpenChange` handler is a no-op, and `disablePointerDismissal` is set). The candidate must click "I Understand" before they can do anything. This is reasonable in principle, but the dialog mentions "IP address changes" and "periodic code snapshots" which may alarm privacy-conscious candidates.

More importantly, the dialog appears on every problem page load (the component renders on the contest detail page AND on each problem page). A candidate navigating between problems sees this dialog repeatedly.

**Impact**: Medium. The repeated modal is friction. The privacy concerns may cause some candidates to abandon the assessment.

**Fix**: Show the privacy notice once per session (persist acceptance in sessionStorage), not on every page load.

---

## Minor Issues

### 6. Countdown Timer Is a Small Badge

**File**: `src/components/exam/countdown-timer.tsx`

The timer renders as a `<Badge>` element. For a high-stakes timed assessment, this is easy to miss, especially on a wide monitor. CodeSignal and HackerRank use large, prominent timer displays that are always visible (often sticky/fixed).

**Fix**: Make the timer larger and/or sticky-positioned so it remains visible while scrolling.

### 7. No Visible Auto-Save Indicator

**Files**: `src/components/problem/problem-submission-form.tsx` (lines 96-134)

The platform saves code snapshots periodically (every 10-60 seconds) during assignment context, but there is no visible indicator that this is happening. A candidate who switches tabs or has a browser crash has no idea whether their work was saved. CodeSignal shows a persistent "Draft saved" indicator.

**Fix**: Add a subtle "Draft saved" indicator near the editor that updates after each snapshot.

### 8. 4-Second Submit Confirmation Delay

**File**: `src/components/problem/problem-submission-form.tsx` (lines 233-327)

There is a 4-second delay after clicking Submit before the actual submission fires, with a toast notification offering a Cancel button. This is a safety net against accidental submissions, but it is non-standard. On every other platform, Submit is immediate. A candidate who is used to instant submission will be confused by the delay. The toast also auto-dismisses after 4 seconds, so if the candidate is not watching the toast area, they may not realize they can cancel.

**Impact**: Low-medium. It is a well-intentioned safety feature, but the UX is unfamiliar.

### 9. Results Page Requires a Separate URL

**File**: `src/app/(auth)/recruit/[token]/results/page.tsx`

After completing the assessment, the candidate needs to visit `/recruit/<token>/results` to see their results. There is no link to this page from the contest detail page, and no notification when results become available. The candidate has to remember the URL or find it in the original email.

**Fix**: Add a "View results" link on the contest detail page (visible after the deadline passes), and optionally send an email notification when results are published.

### 10. Generic Error Messages

**File**: `src/app/(auth)/recruit/[token]/page.tsx` (lines 100-108)

When a token is invalid or revoked, the page shows "Invalid link" with "This link is invalid or has been revoked." This is correct from a security perspective (no information leakage), but it provides zero actionable information. A candidate who clicks an expired link sees the same message as one who clicks a revoked link.

**Impact**: Low. The distinction matters more for debugging than for the candidate, but the "expired" path does have a better message.

### 11. Password Validation Is Minimal

**File**: `src/lib/security/password.ts`

Password validation only checks minimum length (8 characters). No complexity requirements, no breach database check, no strength meter. While this is intentional (the AGENTS.md specifies "Password validation MUST only check minimum length"), for a recruiting context where the password protects assessment integrity, a minimum-length-only policy feels insufficient.

**Impact**: Low. The password is primarily for session management, not long-term account security.

### 12. Language List Truncation

**File**: `src/app/(auth)/recruit/[token]/page.tsx` (lines 222-225)

The landing page shows only the first 6 supported languages with a "+X more" indicator. For a candidate who wants to verify their preferred language is supported before starting, this is frustrating. They have to start the assessment to find out.

**Fix**: Show all supported languages, or at least make the "+X more" expandable.

### 13. No Problem Difficulty or Time Estimates on Contest Overview

**File**: `src/components/assignment/assignment-overview.tsx`

The assignment overview shows problem titles and points, but no difficulty indicators or estimated time per problem. A candidate cannot plan their time allocation across problems without opening each one.

**Fix**: Show difficulty tier and/or point values more prominently to help candidates prioritize.

---

## Positive Observations

1. **Security posture is excellent.** Token hashing (plaintext never stored), IP-based rate limiting, per-invitation brute-force counters with atomic SQL increments, CSRF protection, clock-skew-safe DB time comparisons. This is production-grade security.

2. **Code editor is solid.** CodeMirror 6 with syntax highlighting for 14+ languages, auto-indent, bracket matching, smart newline, fullscreen mode, Cmd/Ctrl+Enter submit shortcut, custom theme support. This is competitive with CodeSignal's editor.

3. **Run-before-submit works well.** The "Run" button with stdin input, stdout/stderr display, compile error output, and execution time is exactly what candidates expect.

4. **Submission feedback is real-time.** Live polling with queue position, grading progress, and status badge with pulse animation. The 5-second queue status polling is responsive.

5. **Submission confirmation safety net.** The 4-second delay with cancel is non-standard but prevents costly accidental submissions.

6. **Code snapshots save work.** Periodic code snapshot uploads (every 10-60 seconds based on activity) protect against browser crashes.

7. **Unsaved changes guard.** Navigation away from the editor with unsaved changes triggers a confirmation dialog.

8. **Dark mode support.** The editor and UI both support dark mode, respecting system preferences.

9. **Internationalization.** Full English and Korean translations, with locale-aware number/date formatting.

10. **Anti-cheat transparency.** The privacy notice dialog explicitly lists what is monitored (tab switches, copy/paste, IP changes, code snapshots). This is more transparent than most competitors.

11. **Results page is clean.** Per-problem breakdown with status badges, scores, execution times, and language info. The total score display is clear.

12. **Contact email is always visible.** Both the landing page and results page show the recruiter's contact email, which is a professional touch.

---

## Comparison to Competitors

| Feature | JudgeKit | HackerRank | CodeSignal | LeetCode |
|---|---|---|---|---|
| Password recovery | None (admin only) | Email-based | Email-based | Email-based |
| Password confirmation | None | Yes | Yes | Yes |
| Timer prominence | Small badge | Large, sticky | Large, sticky | Large, sticky |
| Auto-save indicator | None | Visible | Visible | Visible |
| Anti-cheat disclosure | Modal + banner | Banner | Banner | N/A |
| Code editor quality | Good (CM6) | Good (CM5/6) | Good (Monaco) | Good (CM6) |
| Run-before-submit | Yes | Yes | Yes | Yes |
| Submission feedback | Real-time polling | Real-time | Real-time | Real-time |
| Results visibility | Manual URL | In-app | In-app | In-app |
| Error recovery | Manual | Automatic | Automatic | Automatic |

---

## Suggestions for Improvement

### High Priority
1. **Add password confirmation field** to the recruit start form. This is a 30-minute fix that prevents the most common lockout scenario.
2. **Implement self-service password reset** via email. Even a simple "send reset link" flow would be a massive improvement.
3. **Increase lockout threshold** from 5 to 10 attempts, with a cooldown period.
4. **Make the timer prominent and sticky.** A timed exam lives and dies by its timer visibility.

### Medium Priority
5. **Add auto-save indicator** near the editor ("Draft saved at 14:32").
6. **Show privacy notice once per session**, not per page load.
7. **Condense the review notice** on the landing page to 1-2 sentences with an expandable details section.
8. **Add a "View results" link** on the contest detail page after the deadline.
9. **Show all supported languages** on the landing page (or make the list expandable).

### Low Priority
10. **Add problem difficulty indicators** to the contest overview.
11. **Add a strength meter** for the password field.
12. **Show estimated time per problem** if available.
13. **Add email notification** when results are published.

---

## Overall Grade: B

The platform is technically impressive -- the security model is better than most competitors, the code editor is production-quality, and the real-time submission feedback is polished. However, the candidate experience has rough edges that would shake my confidence in a company using it for hiring. The lack of password recovery and confirmation fields is the most glaring gap, and the intimidating review notice sets an adversarial tone. With the high-priority fixes above, this would easily be an A-/A. The foundation is strong; the polish just needs to catch up.