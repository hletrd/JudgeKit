# Job Applicant Perspective Review — JudgeKit

**Reviewer persona**: Job applicant who receives an invitation token, takes a coding test under time pressure, and is evaluated by a recruiter.
**Date**: 2026-05-03
**Compared against**: April 17 review (score: 6/10), May 3 live probe (score: 5/10)

---

## Score by area

| Area | Score | Key change since April |
|---|---|---|
| Invitation & Onboarding | 8/10 | +1 — Employer branding, language list, contact email, honest AI disclosure |
| Test Taking | 7.5/10 | +0.5 — 4s undo, platform-aware shortcuts; mobile still weak |
| Test Integrity | 6.5/10 | +2.5 — Heartbeat enforcement closes curl-only path; still no lockdown browser |
| Scoring & Evaluation | 7.5/10 | +0.5 — Candidate results page exists; no anonymized export |
| Privacy & Data Protection | 7/10 | +2 — Privacy page, honest disclosure, data retention windows, rights |
| Result Communication | 7/10 | +2 — Candidate results page at /recruit/[token]/results |

**Overall: 7/10** (up from 6/10)

---

## What got better

### 1. Candidate results page — the biggest UX win
`/recruit/[token]/results` now shows:
- Total score with per-problem breakdown
- Best submission per problem with status, language, runtime
- Organization name and contact email
- Auth-gated (must be the invitation's userId, logged in)
- Only visible after deadline + recruiter enables `showResultsToCandidate`

This was the #1 applicant frustration — finishing a test and hearing nothing back. The results page doesn't show other candidates' data (no ranking, no curve), which is appropriate.

### 2. Employer branding on recruit page
`organizationName`, `organizationLogoUrl`, `contactEmail` are now rendered on the recruit page. A candidate can see who is testing them before they commit. This was a trust gap — without branding, the recruit page looked like a phishing form.

### 3. Language list visible before starting
The recruit page now shows the count of enabled languages and the first 6 as badges. A Python-only developer can see that Python is available before committing to start. This was an accessibility issue.

### 4. Honest anti-cheat disclosure
The recruit page now includes a "Review Notice" section that honestly discloses:
- Submissions and browser activity are monitored
- Tab switches and copy/paste are tracked as signals
- Signals are used for corroboration, not as proof
- AI-generated code is difficult to detect

This is good ethics and good risk management. A candidate who reads this knows the platform's capabilities and limitations honestly.

### 5. Heartbeat enforcement
For exam-mode assignments with anti-cheat enabled, the server now rejects submissions unless a recent browser heartbeat exists (within 60 seconds). This means a candidate with `curl` and a stolen cookie can no longer submit code while appearing to have a "clean session." This was the most critical integrity gap for recruiting.

### 6. Privacy page
`/privacy` documents data classes, retention windows, rights (access, deletion, objection), and contact information. For recruiting candidates whose data is processed, this is a legal and ethical requirement.

---

## What still needs work

### F1. Candidate name shown pre-auth in resume path (MEDIUM)
`recruit/[token]/page.tsx:119` shows `t("welcome", { name: invitation.candidateName })` for `resumeWithCurrentSession`. For a senior candidate at a competing company, this means anyone with the token URL sees their name and the assessment title. The OG metadata now uses generic text (not candidate name), which is an improvement, but the page body still leaks for the resume path.

**Recommendation**: Defer name display until after authentication. Show "Welcome back" without the name for the resume path.

### F2. No lockdown browser integration (HIGH for high-stakes)
The heartbeat enforcement raises the bar significantly — a candidate can no longer submit from `curl` while their browser sits idle. But a candidate with a second device (phone, tablet, VM) and the browser open can still use ChatGPT alongside the test. The anti-cheat monitor sees perfect heartbeats and zero tab switches because the candidate isn't switching tabs — they're using a second screen.

For low-stakes screening, this is acceptable. For final-round hiring decisions, this is still a gap. Safe Exam Browser integration or live proctoring is needed.

### F3. No anonymized CSV export (MEDIUM)
The recruiter's CSV export includes candidate emails, names, and IP addresses. No option to export just scores without PII. For internal review where the hiring committee shouldn't see candidate identities until shortlisting, this is a gap.

### F4. No GDPR data-subject request endpoint (MEDIUM)
The privacy page describes rights (access, deletion, objection) and links to the profile page, but there's no automated data-subject request endpoint. A candidate who wants their data deleted must email `privacy@xylolabs.com` and wait for manual processing. For GDPR compliance, an automated request flow is recommended.

### F5. Temp password still shown in recruiter UI (LOW)
`resetRecruitingInvitationAccountPassword` generates a `Recruit-{nanoid(16)}` password and exposes it in the recruiter UI with a copy-to-clipboard button. If the recruiter's screen is shared or recorded, the password is leaked. The fix would be to send the password via email instead.

---

## Recruiting readiness assessment

| Recruiting use case | Readiness | Caveat |
|---|---|---|
| Initial technical screening (low-stakes) | **READY** | Heartbeat enforcement + honest disclosure is sufficient |
| Take-home assignment (honor-system) | **READY** | Same as above |
| Proctored final-round test | **NOT READY** | Need lockdown browser or live proctoring |
| Batch hiring with multiple candidates | **READY-WITH-CAVEATS** | Code similarity works for same-pool plagiarism; doesn't detect AI use |

---

## Summary

JudgeKit went from "functional test-taking with integrity and privacy concerns" to "defensible recruiting platform for honor-system use cases." The candidate results page, employer branding, honest anti-cheat disclosure, and heartbeat enforcement are the four changes that move this from "internal tool re-skinned for external use" to "credible recruiting product." The remaining gaps (lockdown browser, anonymized export, GDPR endpoint) are incremental improvements, not architectural barriers.
