# Applicant Perspective Review: JudgeKit Recruiting Flow

**Reviewer persona:** Job applicant who receives an invitation token, takes a coding test under time pressure, and is evaluated by a recruiter.
**Date:** 2026-04-17 (Post-Plan-008)

---

## 1. Invitation & Onboarding — 7/10

**What works well:**

The `/recruit/[token]` page provides a clean onboarding experience: personalized greeting ("Welcome, {name}"), context upfront (problem count, duration, deadline), important notes section (timer behavior, resubmission policy, stability), review notice disclosing monitoring. Re-entry support handles three distinct states: same-session resume, password-based re-entry, and expired-session recovery.

**What needs improvement:**

- **No preview of allowed languages.** The recruit page shows problem count and duration but not which programming languages are available. An applicant who only knows Python would want to know this before committing.
- **"Start Assessment" has no confirmation dialog.** Unlike the group exam flow which has a `Dialog` confirming duration, the recruit flow's "Start Assessment" button is irreversible with no second chance to verify stable connection.
- **Token URL is long and opaque.** The 32-character base64url token means candidates cannot verify the link looks legitimate. No company branding or test name in the URL.
- **Expired token messaging is abrupt.** "This link has expired. Contact the organizer for a new one." — no indication of who the organizer is or how to contact them.
- **Candidate name visible on unauthenticated token page.** If a token URL leaks, it reveals who the test is for and what the test is called.

---

## 2. Test Taking Experience — 7/10

**What works well:**

Split-pane layout with problem statement on the left, code editor on the right. CodeMirror editor with syntax highlighting, language selection, fullscreen mode. Real-time submission feedback via SSE. "Run" button for testing before submitting. Countdown timer with server time sync and warnings at 15/5/1 minutes. Windowed exam mode with personal deadline.

**What needs improvement:**

- **No countdown timer on the candidate dashboard.** A candidate in a timed exam must navigate to the contest page to see the countdown. The dashboard shows no time remaining.
- **Candidate dashboard is minimal.** Three stat cards and 5 recent submissions. No per-problem progress, no "time remaining" indicator, no visual sense of completion.
- **Side-by-side diff view is unreadable on mobile.** `grid-cols-2` under 375px is too narrow. No fallback to unified diff.
- **Sticky code panel harmful on mobile.** Prevents scrolling to the submission form on single-column layout.
- **No offline detection.** If network drops, the candidate sees generic error toasts with no guidance. Their code is saved in localStorage drafts, but they don't know if their submission was sent.

---

## 3. Test Integrity — 4/10

**What works well:**

Anti-cheat monitor tracks tab switches, copy/paste events, blur events, right-clicks, and sends 30-second heartbeats. Privacy notice is shown before monitoring begins. Heartbeat gap detection flags periods over 2 minutes. Code similarity uses Jaccard n-gram comparison with identifier normalization.

**What's critically broken:**

- **All anti-cheat events are client-reported.** A technically skilled candidate can:
  - Disable JavaScript entirely
  - Use a second device (phone, VM)
  - Block the anti-cheat POST calls in browser devtools
  - Submit directly to the API via curl with no anti-cheat events generated
  - Use AI tools (ChatGPT, Copilot) on a second screen while the monitor sees perfect heartbeats
  
  The system would show zero tab switches and perfect heartbeats for a candidate who copy-pasted a ChatGPT solution from their phone. This is **security theater** for anyone with basic technical skills.

- **No server-side enforcement that the monitor must be active.** Submissions are accepted regardless of whether the anti-cheat monitor is running. There is no check that "submission must come from a browser with active monitoring."

- **Copy/paste detection does not capture clipboard content.** The system only records "paste: target: code-editor" — not what was pasted. A candidate could paste a complete ChatGPT solution and the system would only see "paste event on code editor."

- **Code similarity doesn't catch AI-generated code.** The Jaccard n-gram comparison detects similar code between candidates, but AI-generated submissions are unique by design. Two candidates using ChatGPT for the same problem would produce different code that passes the similarity check.

**For recruiting specifically:** This is the most critical gap. A coding test for hiring has zero integrity if the anti-cheat can be bypassed by any candidate with a phone and ChatGPT.

---

## 4. Scoring and Evaluation — 7/10

**What works well:**

Two scoring models (IOI and ICPC). Late penalty is configurable. Recruiter candidates panel shows ranked table with per-problem scores, anti-cheat flag counts, and CSV export. CSV export includes formula injection protection.

**What needs improvement:**

- **No manual score override visible in the recruiting panel.** If a test case is wrong, the recruiter has no UI to adjust a candidate's score.
- **CSV export includes IP addresses and anti-cheat event counts.** Sensitive PII with no access audit trail for who downloaded it.
- **No anonymized export option.** Candidate emails and names are always included.

---

## 5. Privacy and Data Protection — 5/10

**What works well:**

Data retention policies exist: recruiting records for 365 days, anti-cheat events for 180 days, submissions for 365 days. Pruning runs daily. Legal hold environment variable can suspend pruning. Privacy notice is shown before anti-cheat monitoring begins.

**What needs improvement:**

- **Temporary password shown in recruiter UI.** `resetRecruitingInvitationAccountPassword` generates a `Recruit-{nanoid(16)}` password and exposes it in the recruiter UI with a copy-to-clipboard button. No audit log is recorded for this action. If the recruiter's screen is shared or recorded, the password is leaked.
- **Candidate PII in exports without anonymization.** No way to export just scores without names and emails.
- **Token URL exposes candidate name and assignment title.** Anyone with the URL can see who the test is for.
- **IP addresses stored in contest_access_tokens and anti_cheat_events.** Tracking without explicit consent beyond the privacy notice.
- **No GDPR/privacy policy page.** No way for candidates to request data deletion or access their stored data.

---

## 6. Result Communication — 5/10

**What works well:**

Real-time submission feedback via SSE. Terminal verdicts streamed back with per-test-case results. Source code stripped for non-owners without `submissions.view_source`. Recent submissions visible on candidate dashboard.

**What needs improvement:**

- **No "results released" notification.** A candidate who finishes has no way to know when their results are final.
- **No personal score summary page.** Candidates must piece together their performance from the recent submissions list — no aggregate view.
- **No per-problem breakdown for candidates.** They only see aggregate scores, not which problems they solved and which they didn't.
- **No post-assessment feedback.** Unlike HackerRank which shows "Your solution scored X/Y on test cases", JudgeKit shows only the raw score number.

---

## Summary Scorecard

| Area | Score | Key Issue |
|---|---|---|
| Invitation & Onboarding | 7/10 | No language preview, no start confirmation |
| Test Taking | 7/10 | No timer on dashboard, poor mobile UX |
| Test Integrity | 4/10 | Anti-cheat is security theater for technical candidates |
| Scoring | 7/10 | No score override, PII in exports |
| Privacy | 5/10 | Temp password in UI, no anonymized export |
| Result Communication | 5/10 | No notification, no summary page |
| **Overall** | **6/10** | Functional test-taking, integrity and privacy are concerns |

---

## Critical Recommendations for Recruiting Use

1. **Integrate Safe Exam Browser or lockdown browser.** Without this, coding tests for hiring have no integrity guarantee.
2. **Add server-side anti-cheat.** Detect API-only submissions (no browser session), verify submission origin, check for impossibly fast solutions.
3. **Add post-assessment results page.** Candidates deserve to see their performance summary.
4. **Remove temporary password from UI.** Send via email instead.
5. **Add anonymized export.** Recruiters should be able to export scores without PII for internal review.
6. **Add consent and privacy policy.** Required for GDPR compliance when processing candidate data.
