# Job Applicant / Recruiting Candidate Review — JudgeKit — 2026-05-15

**Reviewer persona:** Software engineer taking a 90-minute coding assessment for a backend role at a startup that uses JudgeKit. Received a recruiting token via email. Has never heard of JudgeKit before. Is evaluating the company partly by the quality of their assessment tooling.
**Method:** Inspected `src/app/(auth)/recruit/`, `src/app/(dashboard)/dashboard/candidate/`, `src/lib/recruiting/`, recruiting token flow, and candidate-facing UI. Walked the full candidate journey from email invite to result page.
**Scope:** First impression, fairness, privacy, integrity signaling, result clarity, accessibility.

## Verdict (1-10) per dimension

| Dimension | Score | One-line summary |
|---|---|---|
| Onboarding flow | **6/10** | Token-based auth is smooth: click link, set password, start assessment. But the recruit page shows generic "JudgeKit" branding with no company logo fallback, and OG metadata leaks the platform name in Slack previews. |
| Assessment experience | **7/10** | Clean problem statement rendering (KaTeX for math), CodeMirror editor with language selection, sample I/O visible. Autosave works. No "run sample" button — candidates must submit to see if their code works. |
| Fairness | **5/10** | Server-time sync prevents clock-drift unfairness. But per-language time limits have no multipliers (Python is disadvantaged). No "practice mode" before the real assessment. No accessibility statement. |
| Privacy | **5/10** | Anti-cheat monitoring is disclosed (correct). No GDPR data-subject path (no "download my data," no "delete my account"). Code snapshots are taken during the assessment — disclosed but not explained in plain language. |
| Integrity signaling | **4/10** | The anti-cheat dashboard gives recruiters signals, but the platform docs correctly call these "advisory, not proof." The recruit-start page does not carry the same honest disclaimer. A recruiter might misinterpret a clean heartbeat log as proof of honesty. |
| Result communication | **5/10** | `showResultsToCandidate` and `hideScoresFromCandidates` toggles exist. But the candidate dashboard is sparse — just a list of attempts with verdict. No percentile, no comparison, no "areas to improve." |

**Overall candidate experience: 5.5/10.** The core assessment loop is functional and fair-enough for a pre-screen. The platform does not yet feel like a polished recruiting product (no company branding, no practice mode, no detailed feedback). For high-stakes final-round assessments, the integrity gaps make this unsuitable.

---

## Top 5 things that work well

1. **Token-based auth with optional account password.** `src/lib/auth/recruiting-token.ts` generates base64url tokens. Candidates can start with just the token or set a password for re-entry. The token has expiry and one-time-use semantics. This is smoother than "create an account, verify email, then find the assessment."

2. **Recruiting mode hides peer-identifying data.** In `recruiting` platform mode, the Contests, Rankings, and Groups pages are hidden from candidates. The "Problems" label becomes "Challenges," "Submissions" becomes "Attempts." This is a correct privacy choice — candidates should not see how peers performed.

3. **Autosave with re-entry support.** Code drafts are persisted to `localStorage` with a TTL. If a candidate closes the tab and re-opens via the same token, their code is restored. For a 90-minute assessment, this is essential.

4. **AI assistant disabled by default in recruiting mode.** `allowAiAssistant` defaults to false for recruiting assignments. This is the right default — a recruiting assessment should test the candidate's own knowledge.

5. **Candidate-specific dashboard.** `src/app/(dashboard)/dashboard/candidate/page.tsx` shows only the assignments the candidate has been invited to. No platform navigation noise. Clean and focused.

---

## Top 8 candidate frustrations / concerns

### F1. OG metadata leaks "JudgeKit" in Slack/email previews (MEDIUM)
**Where:** `src/app/layout.tsx` or `src/app/(auth)/recruit/layout.tsx`.
When a candidate shares their assessment link in Slack, the unfurl shows "JudgeKit — Programming Assessment Platform" (or similar). This tells the candidate's current employer exactly what platform they are using for job interviews. It also signals to competitors which ATS the company uses.
**Fix:** The recruit page should override OG metadata with the recruiting organization's name (`recruitingOrganizationName` from the assignment). Fallback to generic "Assessment" if unset.
**ETA:** 1 hour.

### F2. No practice mode or sample assessment (MEDIUM)
**Where:** N/A — feature absent.
Candidates receiving their first JudgeKit link have never seen the interface before. There is no "Try a practice problem first" option. The first time they see the editor, the timer is already running.
**Fix:** Add an optional "Practice problem" that assignments can link to. Show the same editor, same verdict rendering, but with a trivial problem and no time limit.
**ETA:** 4 hours.

### F3. Anti-cheat disclosure is legalistic, not plain-language (MEDIUM)
**Where:** `src/app/(auth)/recruit/[token]/recruit-start-form.tsx`.
The anti-cheat notice says something like "Your session will be monitored for integrity purposes." It does not explain what is monitored (tab switches, copy/paste, heartbeats), what is NOT monitored (screen content, webcam, microphone), and what happens to the data.
**Fix:** Rewrite the notice in plain language: "We record when you switch browser tabs, copy/paste, and whether your browser window is active. We do NOT record your screen, webcam, or microphone. Data is reviewed only if there is a concern and is deleted after 90 days."
**ETA:** 1 hour.

### F4. No "run sample" before submit (MEDIUM)
**Where:** `src/app/(dashboard)/dashboard/exams/[id]/page.tsx`.
The candidate must click "Submit" to see if their code passes the sample test cases. There is no "Run against sample input" button that executes without recording a submission. This discourages experimentation and inflates submission counts.
**Fix:** Add a "Run Sample" button that executes against the first visible test case via the compiler endpoint, without creating a submission record.
**ETA:** 3 hours.

### F5. No accessibility statement or accommodations path (MEDIUM)
**Where:** N/A — feature absent.
There is no mention of screen reader support, no high-contrast mode, no font-size adjustment beyond editor preferences, and no "Request accommodations" link for candidates with disabilities.
**Fix:** Add an accessibility footer to the recruit page with contact email. Ensure CodeMirror is keyboard-navigable and has proper aria-labels.
**ETA:** 2 hours.

### F6. Results page is sparse (LOW)
**Where:** `src/app/(auth)/recruit/[token]/results/page.tsx`.
The results page shows verdict, score, and time. No breakdown by problem. No "You struggled with Problem 3 — here is a similar practice problem." No percentile or comparison data (intentionally, for privacy, but candidates still want context).
**Fix:** Add per-problem score breakdown and, if `showResultsToCandidate` is true, show which test cases passed/failed.
**ETA:** 3 hours.

### F7. No GDPR data-subject path (MEDIUM)
**Where:** N/A — feature absent.
Candidates cannot download their data, cannot request deletion, and cannot see what data was retained. For EU candidates, this is a compliance gap.
**Fix:** Add "Download my data" and "Delete my account" buttons to the candidate dashboard. Export JSON with submissions, anti-cheat events, and personal data.
**ETA:** 1 day.

### F8. Company branding is optional and fragile (LOW)
**Where:** `src/lib/db/schema.pg.ts:354-356`.
`recruitingOrganizationName`, `recruitingOrganizationLogoUrl`, and `recruitingContactEmail` are optional. If the instructor forgets to set them, the candidate sees generic JudgeKit branding. There is no validation that the logo URL is HTTPS or from a trusted domain.
**Fix:** Make branding fields required for recruiting assignments. Validate logo URL is HTTPS. Add a preview in the assignment creation UI.
**ETA:** 2 hours.

---

## Integrity signal honesty

The recruit-start page should carry the same disclaimer as the internal docs:

> "This assessment uses browser behavior monitoring (tab switches, copy/paste, active-window checks). These signals help us review sessions if there is a concern, but they are not proof of misconduct on their own. We recommend pairing this assessment with live video interviews for final-round candidates."

This one paragraph would align marketing honesty with architectural reality.
