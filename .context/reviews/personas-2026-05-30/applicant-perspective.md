# JudgeKit — External Job Candidate Perspective Review

Reviewer persona: an **external job applicant** taking a recruiting coding test, plus a privacy-conscious reviewer of the candidate experience. The company is legally responsible for this candidate's personal data (GDPR / Korean PIPA).

Scope: recruiting onboarding (invite email + token), the test-taking experience, results/visibility controls, privacy/data protection, and overall professionalism/fairness. Source only; no files modified.

Date: 2026-05-30
Commit at review: `6e1ea706`

---

## Top risks for production use

Ranked, privacy/legal + fairness weighted highest.

1. **(Fairness, HIGH / Confirmed)** The candidate is repeatedly told "the timer starts when you click Start and cannot be paused or restarted," but in **scheduled** exam mode there is no per-candidate timer at all — every candidate shares one fixed wall-clock `deadline`. A candidate who opens the link 20 minutes before the global deadline gets 20 minutes; a candidate who opens it 2 hours before gets 2 hours. The UI actively misrepresents this. A rejected candidate who later learns they had far less time than the stated "X minutes" has a strong unfairness/discrimination complaint. `src/app/(auth)/recruit/[token]/page.tsx:298-304`, confirm dialog `recruit-start-form.tsx:159-165`, messages `noteTimer`/`instructions`/`durationDetail`.

2. **(Privacy/Legal, HIGH / Confirmed)** No consent gate and no privacy-policy link in the candidate-facing recruit flow. The candidate creates an account, surrenders PII (name + email), and submits code/anti-cheat telemetry **before ever seeing** the privacy page or agreeing to anything. A privacy page exists (`src/app/(public)/privacy/page.tsx`) but is never linked from `/recruit/[token]` or the start form. Under GDPR/PIPA, processing candidate PII and behavioral telemetry without presenting a notice or capturing consent at collection time is a compliance gap. `src/app/(auth)/recruit/[token]/page.tsx` (no `/privacy` link anywhere), `src/components/exam/anti-cheat-monitor.tsx:305-340` (telemetry consent is in-app only, not before account creation).

3. **(Privacy/Legal, HIGH / Confirmed)** The privacy page hardcodes a single tenant's contact address `privacy@xylolabs.com` and the operator email is not configurable. Any other company deploying JudgeKit for recruiting will present **the wrong data-controller contact** to candidates — so a candidate's GDPR/PIPA access/deletion request goes to xylolabs, not the actual hiring company. This both misroutes legal requests and leaks that the platform is third-party-hosted. `src/app/(public)/privacy/page.tsx:83-85`.

4. **(Privacy/Fairness, MEDIUM-HIGH / Confirmed)** No candidate self-service deletion or export. The privacy page tells candidates to "contact us via the email below" for deletion/export and points to "profile preferences," but there is no data-subject-request mechanism in code — and recruiting candidates are blocked from `/login` once their invitation window expires (`isStaleRecruitingCandidate`, `src/lib/recruiting/access.ts:136-162`), so an expired candidate cannot even reach a dashboard to exercise the "manage from your profile" path the policy promises. The promise in the policy is not backed by a working mechanism. `src/app/(public)/privacy/page.tsx:72-78`, `messages/en.json` `recruit.privacy.sectionRequestsIntro`.

5. **(Privacy/Legal, MEDIUM / Confirmed)** Anti-cheat IP addresses and user-agents are stored per event and retained 180 days; submissions and recruiting records 365 days. Automatic pruning is global and not per-candidate, and there is a `DATA_RETENTION_LEGAL_HOLD` that suspends ALL pruning indefinitely. A rejected candidate has no way to know what was retained or to get it deleted earlier, and a legal hold can keep their behavioral data forever with no candidate-facing disclosure. `src/lib/data-retention.ts:1-8`, `src/lib/data-retention-maintenance.ts:106-110`. Defensible as "legitimate interest," but the retention windows and IP capture should be surfaced to the candidate (they currently are on the privacy page they never see — see risk #2).

6. **(Onboarding/Professionalism, MEDIUM / Confirmed)** The recruiting invitation email is plain and slightly unprofessional for an external audience: no organization branding (the org name/logo set on the assignment are not passed into the email), generic "Good luck!" sign-off, no sender identity beyond the raw SMTP `from`, and no privacy/contact line. A candidate receiving this from an unknown domain may distrust it or treat it as phishing. `src/lib/email/templates.ts:55-69`, `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/route.ts:131-143`.

7. **(Security/Trust, LOW-MEDIUM / Suspected)** The recruiting-org logo URL is rendered as a raw `<img src>` with no validation at any write path I could find — and in fact I found **no code path that writes** `recruitingOrganizationName/LogoUrl/ContactEmail` at all (only schema + reads). If a write path exists elsewhere (admin SQL, future UI) without URL validation, a malicious or careless value could attempt SSRF/tracking via the browser, though CSP `img-src 'self' data: blob:` (per the page comment) blocks third-party hosts. Confirm where these columns get populated before shipping. `src/app/(auth)/recruit/[token]/page.tsx:230-241`, `src/lib/db/schema.pg.ts:354-356`.

---

## Findings by area

### A. Onboarding: invite email + token

**A1. Invite token is strong and well-handled. (Positive / Confirmed)**
`generateRecruitingToken()` uses `randomBytes(24).toString("base64url")` = 192 bits of entropy (`src/lib/assignments/recruiting-invitations.ts:153-155`). Only the SHA-256 hash is persisted (`tokenHash`), never the plaintext (`:176`, `:209`). Single-use: redemption atomically flips `status` to `redeemed` with a `WHERE status='pending'` guard (`:690-721`). Expiry is enforced authoritatively by SQL `NOW()` to avoid clock skew (`:703`). Per-invitation brute-force lockout after 5 failed password attempts (`:512-515`) on top of IP rate limiting. This is genuinely solid; an external candidate's link is unguessable, expiring, and single-use. No action needed.

**A2. Email links use the canonical operator host, not the client Host header. (Positive / Confirmed)**
`getPublicBaseUrl()` prefers `AUTH_URL` over the request Host (`src/lib/security/env.ts:95-107`), so the invite link cannot be poisoned to point at an attacker origin via a spoofed Host header. Good — this is exactly right for a link a candidate will trust.

**A3. HTML escaping in the invite email is correct. (Positive / Confirmed)**
`renderRecruitingInvitationEmail` escapes `candidateName`, `assessmentTitle`, and `accessUrl` before interpolation (`src/lib/email/templates.ts:55-67`). A candidate name containing `<` or quotes cannot break the markup. Note: the plain-text body uses the un-escaped values, which is correct for text/plain.

**A4. Email is bare / not branded → looks like phishing. (MEDIUM / Confirmed)**
The email subject is `You're invited: <title>` and body is generic with no company name, no logo, no "from <Company> recruiting," and no privacy/contact footer (`templates.ts:59-67`). The assignment already has `recruitingOrganizationName` and `recruitingContactEmail`, but the API does not pass them to the template (`recruiting-invitations/route.ts:131-136` passes only `assessmentTitle`). For an external candidate getting mail from an unfamiliar SMTP domain, this materially raises the chance the mail is ignored or reported. Fix: include the organization name in the subject/body and a contact line; consider an SPF/DKIM/`From: "Company Recruiting" <...>` display name.

**A5. Password requirements not shown before submit; vague failure. (LOW / Confirmed)**
On the start form the only hint is `accountPasswordHint` and a client-side min-length check (`recruit-start-form.tsx:54-57`). On a failed `signIn` the candidate sees a single generic `t("startFailed")` "Couldn't start. Try again." (`:87-88`) — even when the real cause is `accountPasswordIncorrect`, `tokenLocked`, or `assignmentClosed` (all distinct errors from `redeemRecruitingToken`). A returning candidate who mistypes their password just sees "Couldn't start," and after 5 tries is silently locked out with the same opaque message. This is frustrating and erodes trust. Fix: surface at least "incorrect password" vs "link locked / expired" to the candidate.

**A6. Candidate account email is not verified and effectively unmanageable. (LOW / Confirmed)**
The candidate account is created with `email: invitation.candidateEmail` and no verification step (`recruiting-invitations.ts:662-671`). The account can later be used at `/login` with the recruiting email + password (`accountPasswordLoginNotice`), but only until the window expires (`isStaleRecruitingCandidate`). So the candidate has a real account holding their PII that they cannot self-manage after the test. Combined with A4/risk #4, this is the crux of the data-subject-rights gap.

### B. Taking the test

**B1. Windowed timer starts on explicit Start — fair. (Positive / Confirmed)**
For `windowed` exams, `startExamSession()` sets `personalDeadline = now + examDurationMinutes` only when the candidate actively starts (`src/lib/assignments/exam-sessions.ts:81-98`). Redeeming the invite does NOT start the clock — `redeemRecruitingToken` only creates the account + access token (`recruiting-invitations.ts:662-687`), so a candidate can redeem, read instructions, and start when ready. The clock-start claim is accurate **for windowed mode**.

**B2. Timer claim is FALSE for scheduled mode. (HIGH / Confirmed)** — see Top Risk #1.
`getContestStatus` for `scheduled` mode ignores any personal start; it's purely `startsAt`/`deadline` (`src/lib/assignments/contests.ts:45-49`). Yet every candidate sees "The timer begins when you click Start and cannot be paused or restarted" (`messages/en.json` `noteTimer`, rendered unconditionally at `page.tsx:301`). Candidate harm: unequal effective time depending on when they happened to open the link; company liability: a defensible discrimination/unfairness claim from a rejected candidate. Fix: make the instruction conditional on `examMode`, and for scheduled mode state the actual shared deadline window.

**B3. Disconnect handling is robust and reassuring. (Positive / Confirmed)**
Anti-cheat events queue to `localStorage` and retry with exponential backoff (`anti-cheat-monitor.tsx:75-130`), flushing on `online`/refocus. The countdown timer re-syncs with server time on refocus and corrects for background-tab throttling (`countdown-timer.tsx:82-114, 179-201`). A candidate who briefly loses connection won't lose work or get a wrong clock. Good.

**B4. Tab-switch grace period reduces false positives — fair. (Positive / Confirmed)**
A 3-second grace timer before logging `tab_switch` avoids penalizing accidental Alt-Tab/notification clicks (`anti-cheat-monitor.tsx:50, 210-218`). Reasonable from a candidate-fairness standpoint.

**B5. Anti-cheat consent dialog is present but late and per-device only. (MEDIUM / Confirmed)**
A blocking modal lists the monitored signals (tab switch, copy/paste, IP, code snapshots) and requires "Accept" before monitoring starts (`anti-cheat-monitor.tsx:305-340`). Good that it warns. But: (a) it appears only after the account is created and the candidate is inside the contest — too late for collection-time consent (risk #2); (b) acceptance is stored in `sessionStorage` keyed per assignment, so it re-prompts on every new tab/session, which is annoying; (c) "Accept" is the only button — there is no decline path, so it is notice, not consent. For a recruiting context the start page itself already shows a "review notice" (`page.tsx:306-315`), which is good, but neither is tied to a privacy policy.

**B6. Instructions are otherwise clear. (Positive)**
The start page shows problem count, duration, deadline, available languages, and an honest "review notice" explaining that reviewers corroborate signals and that AI-similarity checks don't by themselves prove AI use (`messages/en.json` `reviewNotice*`). This is unusually candid and candidate-respectful. Keep it.

### C. Results & visibility controls

**C1. Candidate results page is correctly locked down. (Positive / Confirmed)**
`/recruit/[token]/results` requires: live session whose `user.id` matches the invitation's `userId` (`results/page.tsx:104-117`), defense-in-depth that the user is actually a recruiting candidate for that assignment (`:123-139`), the contest to be closed, AND `showResultsToCandidate=true` (`:166-182`). It shows only the candidate's own best submission per problem and links only to their own code. It does NOT expose other candidates, hidden test cases, anti-cheat internals, or IPs (per the file's own contract comment, `:36-45`). `hideScoresFromCandidates` correctly suppresses numeric scores while still showing verdicts (`:248, 266, 327`). Good.

**C2. Leaderboard hides other candidates' identity from candidates. (Positive / Confirmed)**
For recruiting candidates the leaderboard endpoint returns `403` outright (`leaderboard/route.ts:37-39`) — a candidate cannot see the leaderboard at all. Even for ordinary students, `userId` is always cleared and names are anonymized in exam/anonymous mode (`:70-85`). No PII leak of other candidates. Good.

**C3. A candidate cannot see other candidates' submissions/code. (Positive / Confirmed)**
The submissions list filters to `submissions.userId = user.id` unless the caller has the `submissions.view_all` capability (`submissions/route.ts:46`), which the `student` role (assigned to recruiting candidates) does not have. Confirmed candidates only ever see their own work.

**C4. "Results hidden by recruiter" messaging is honest. (Positive)**
When `showResultsToCandidate` is off, the candidate sees a clear "the recruiter has not enabled candidate-visible results" message with a contact prompt rather than a blank or error (`results/page.tsx:169-182`, `resultsHiddenByRecruiter`). Reasonable.

### D. Privacy & data protection

**D1. No consent / no privacy link at collection. (HIGH / Confirmed)** — Top Risk #2.

**D2. Wrong data-controller contact for non-xylolabs tenants. (HIGH / Confirmed)** — Top Risk #3.

**D3. No working data-subject-request path; stale candidates locked out. (MEDIUM-HIGH / Confirmed)** — Top Risk #4.

**D4. PII is reasonably minimized at collection. (Positive / Confirmed)**
Only `candidateName` + `candidateEmail` are collected for the invitation, plus a free-form `metadata` map the recruiter controls. The candidate themselves supplies only a password. Username is a random `nanoid(10)` (`recruiting-invitations.ts:649`), not derived from PII. IP/user-agent are captured for anti-cheat/access only. This is appropriately minimal — the risk is in disclosure/retention/consent, not over-collection.

**D5. Retention is implemented but opaque to the candidate. (MEDIUM / Confirmed)** — Top Risk #5. Windows: audit 90d, anti-cheat 180d, login 180d, recruiting 365d, submissions 365d (`data-retention.ts:1-8`). Pruning is global and batched (`data-retention-maintenance.ts`), with a blanket `DATA_RETENTION_LEGAL_HOLD` that suspends everything (`:106-110`). A candidate is never told their personal retention clock, and a legal hold can extend it indefinitely with no disclosure.

**D6. Recruiting prune could delete a candidate's own dispute evidence. (LOW / Suspected)**
`pruneRecruitingInvitations` deletes redeemed/revoked invitations after 365 days (`data-retention-maintenance.ts:47-61`) while submissions prune on the same 365d window but anti-cheat on 180d. After 180 days the anti-cheat telemetry that a rejection may have been (partly) based on is gone, but the rejection decision and the submission may persist longer — so a candidate disputing a "flagged for cheating" rejection at month 7+ cannot get the underlying telemetry. Asymmetric retention across linked records is a minor fairness/defensibility wrinkle.

**D7. Submission code is protected from other candidates and most staff. (Positive / Confirmed)**
Code is visible only to the owner and capability-holders (`submissions.view_all`), and the candidate results page explicitly avoids exposing the recruiter view. No cross-candidate code exposure found.

### E. Professionalism & trust

**E1. The honest "review notice" builds trust. (Positive)** — see C/B6. Telling candidates up front that signals are corroborated and that similarity checks don't prove AI use is fair and unusually transparent.

**E2. Bare email + unfamiliar domain undermines first impression. (MEDIUM)** — see A4.

**E3. Misleading timer instruction undermines trust the moment results are disputed. (HIGH)** — see B2/Top Risk #1.

**E4. Generic failure messages on the start form feel broken. (LOW)** — see A5.

---

## Priority-ranked fix checklist

1. **[HIGH · Fairness] Fix the timer instruction for scheduled mode.** Make `noteTimer`/`durationDetail`/the confirm dialog conditional on `assignment.examMode`. For `scheduled`, state the actual shared open/close window instead of "the timer starts when you click Start." Files: `src/app/(auth)/recruit/[token]/page.tsx:298-304`, `src/app/(auth)/recruit/[token]/recruit-start-form.tsx:159-165`, `messages/en.json` (`recruit.noteTimer`, `recruit.instructions`, `recruit.durationDetail`).

2. **[HIGH · Legal] Add a privacy notice + consent at collection.** Link `/privacy` from `/recruit/[token]` and from the start form, and present the data-collection notice before account creation (not only the in-contest anti-cheat modal). Capture an explicit "I have read and agree" before redeem. Files: `src/app/(auth)/recruit/[token]/page.tsx`, `recruit-start-form.tsx`.

3. **[HIGH · Legal] Make the data-controller contact configurable.** Replace the hardcoded `privacy@xylolabs.com` with the deploying tenant's `recruitingContactEmail` / a system setting, and show the correct operator. File: `src/app/(public)/privacy/page.tsx:83-85`.

4. **[MEDIUM-HIGH · Legal] Provide a real data-subject-request path for candidates**, reachable even after the invitation window expires (stale candidates are currently locked out of `/login`). Either a tokenized self-service export/delete from the recruit link, or at minimum an accurate, working contact route. Files: `src/lib/recruiting/access.ts:136-162`, `src/app/(public)/privacy/page.tsx:72-78`, `messages/en.json` `recruit.privacy.*`.

5. **[MEDIUM · Trust] Brand and professionalize the invitation email.** Pass `recruitingOrganizationName`/`recruitingContactEmail` into the template; add a sender display name, a contact/privacy line, and a "if you didn't expect this" note. Files: `src/lib/email/templates.ts:55-69`, `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/route.ts:131-143`.

6. **[MEDIUM · UX/Trust] Surface specific start-form errors** (incorrect password vs link expired/locked vs contest closed) instead of the single generic `startFailed`. Files: `src/app/(auth)/recruit/[token]/recruit-start-form.tsx:87-92`, `messages/en.json` `recruit.*`.

7. **[LOW-MEDIUM · Security] Confirm/validate the org logo URL write path.** Locate where `recruitingOrganizationLogoUrl` is set (none found in repo) and ensure it is validated (same-origin per CSP, no `javascript:`/`data:` surprises) before it ships. Files: `src/lib/db/schema.pg.ts:354-356`, `src/app/(auth)/recruit/[token]/page.tsx:230-241`.

8. **[LOW · Privacy] Disclose retention windows to the candidate at collection** and reconsider asymmetric windows (anti-cheat 180d vs submissions/recruiting 365d) so dispute evidence isn't deleted before the decision record. Files: `src/lib/data-retention.ts:1-8`, `src/lib/data-retention-maintenance.ts:47-83`.

9. **[LOW · UX] Persist anti-cheat consent more durably** (currently `sessionStorage`, re-prompts every tab). File: `src/components/exam/anti-cheat-monitor.tsx:39-45, 326-333`.
