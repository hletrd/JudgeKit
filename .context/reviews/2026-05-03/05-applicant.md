# Applicant Review — JudgeKit Recruiting Mode (algo.xylolabs.com) — 2026-05-03

I read the recruit page source, the recruit-start form, the anti-cheat monitor, the i18n strings shown to candidates, the recruiting-token validate route, and walked the live deployment behind a synthetic invite. This review is from the perspective of a software engineer who has just been emailed a coding-test link by a company they have not yet decided to work for. I am the only person they care about pleasing in this flow.

## Verdict — would I take this test? Would I trust the employer?

I would take it, but I would not be enthusiastic, and the employer would lose status with me before I wrote my first line of code. The fundamentals are competent: the start screen tells me how many problems and how long, it asks me to set my own password, it asks me to confirm before the timer starts, and it discloses (in a soft way) that monitoring may be active. That is more than I get from most "send a HackerRank link" recruiters. But the platform feels like an internal tool that has been re-skinned for external candidates rather than a product designed for them. There is no employer branding on the start page (I am told I have been invited to "Coding Assessment" with no logo, no recruiter contact, no company name). The anti-cheat dialog is honest enough to mention IP-address and code-snapshot capture but never tells me how long any of it is kept or who can see it. And once I am in, the candidate dashboard is the same lean dashboard a logged-in admin would see, including a "Submissions" item in the public navigation that is supposed to be gone in recruiting mode but is still present on the live site (probe-evidence.md, B4). Every one of those is recoverable; together they make the platform feel one tier below HackerRank, Codility, or CodeSignal in product polish, not technical capability.

For trust: the privacy disclosures do not name the data controller, do not give a deletion address, and the public Rankings page (probe-evidence.md, B3) leaks the literal username "admin" with role "Super Admin" — visible to me without logging in, on the same domain that is hosting my hiring test. That is unforced. If I were comparing two finalists for a job and both used a coding test, this one would feel less professional, and I would consider that a small but real signal about the engineering culture inside.

## Top 5 strengths from a candidate POV

1. **Pre-start confirmation dialog with timer warning.** `recruit-start-form.tsx:148-177` opens an `AlertDialog` after I click Start that shows the assessment title, the duration, the "timer cannot be paused or restarted" warning, and a connection sanity check. The previous applicant review (`.context/reviews/05-applicant.md` line 17) flagged this as missing; it has since been added. This is a meaningful candidate-protective change.

2. **Honest anti-cheat disclosure, in a modal that blocks until accepted.** `anti-cheat-monitor.tsx:274-299` puts the privacy notice in a Dialog that cannot be closed except by clicking "I Understand". It enumerates the four capture categories explicitly: tab/window switches, copy/paste, IP-address changes, and periodic code snapshots (`messages/en.json:2104-2110`). Most coding-test platforms gloss over the snapshot capture; JudgeKit names it. The README's Platform Modes table also documents that AI assistance is disabled by default in Recruiting mode (README:251), and the recruit start page calls that out explicitly: "AI help is unavailable in assessment mode" (`messages/en.json:2652`). That is the right disclosure and the right default.

3. **Multiple submissions, best-score wins.** "You may submit multiple times; your best score counts." (`messages/en.json: noteSubmissions`). This is the right scoring policy for a candidate test — it removes the "I had it but I broke it on the last submit" panic. It should be louder; it is buried in a three-bullet "Before you start" amber callout (`page.tsx:251-256`).

4. **Persistent autosave to server every ~10s while I type.** `problem-submission-form.tsx:101-125` posts a server-side snapshot to `/api/v1/code-snapshots` whenever the editor content changes, with a 10s/60s adaptive interval. Wi-Fi drops, browser crashes, accidental tab closes — my code is in the database. The schema accepts up to 256 KiB per snapshot (`route.ts:14-17`). For a candidate this is the single most stress-reducing feature on the platform and almost no one mentions it in their UI. I would put it in the "Before you start" notes verbatim: "Your code is auto-saved every few seconds. If your browser crashes, you can resume."

5. **Re-entry on the same link.** `page.tsx:145-175` handles three resume states: same-session resume (no re-auth), recruit-email + account-password re-login, and forced password reset if the recruiter had to invalidate it. The candidate-side i18n is clean: "After your first start, you can sign in later with your recruiting email and account password through the normal login page." (`accountPasswordLoginNotice`). That is a thoughtful flow for laptop-died-mid-test; HackerRank does similar but rarely surfaces it as plainly.

## Top 10 candidate frustrations / red flags

Each item is rated **C-Sev** (candidate-severity) on a 1–5 scale, where 5 means "I might walk away or distrust the employer."

### F1 [C-Sev 5] — Token URL leaks candidate name to anyone who has the link

**Evidence:** `page.tsx:118-119` resolves `t("welcome", { name: invitation.candidateName })` and the same name is rendered in the unauthenticated card before any password is supplied. The same row is fetched from the DB before the token is auth-validated (`page.tsx:71`).

If the recruiter forwards my invite to me and I forward it to a friend or it ends up in a Slack with link previews, the OG/Twitter card will say "Welcome, Jiyong Youn" with the assessment title. The metadata generator (`page.tsx:23-58`) populates `description` and `openGraph.title` from the assessment data without redacting the name. Anyone who scrapes my email — corporate IT, an autoresponder bot, an OOO scanner — can de-anonymize who is being recruited for what role. For a senior candidate looking at a competitor company, that is a confidentiality breach that could cost them their current job.

**Fix:** Show the welcome name *only* after the candidate has authenticated with their account password (state: `resumeWithCurrentSession === true`). On first arrival, show "You have been invited to a coding assessment for {company}." with no PII. Strip name from `<title>` and Open Graph metadata.

### F2 [C-Sev 5] — No employer / company branding on the recruit page

**Evidence:** `page.tsx:204-207` titles the card with `t("title")` = literal string "Coding Assessment". There is no `assignment.company`, `assignment.brandLogoUrl`, or `recruitingInvitation.organizationName` field referenced. The only proper noun on the page is the assessment `title` (e.g., "Backend SWE 2026 Q1 Assessment") which I as a candidate have no way to verify.

A candidate cannot tell whether the link is from the company that emailed them or from a phishing intermediary. The HSTS-pinned hostname is `algo.xylolabs.com`, not `{employer}.com`. I would have to trust the link-out from the recruiter email. For a recruiting-mode product this is the most basic missing piece.

**Fix:** Add `organization_name`, `organization_logo_url`, and `recruiter_contact_email` columns on `recruiting_invitations` (or on the parent `assignments` row). Render the logo and the contact email at the top of the recruit card. Add a one-line "Issued by {organization} · contact {recruiter_email}" footer on every state of the page including the expired-link card so the candidate always knows whom to ask.

### F3 [C-Sev 4] — "Coding Assessment" page does not surface integrity scope until the test has already started

**Evidence:** The recruit start page (`page.tsx:257-264`) shows `reviewNoticeTitle`, `reviewNoticeSubmissions`, `reviewNoticeSignals`, `reviewNoticeAi` (`messages/en.json:2649-2652`). But the actual hard-disclosure list (tab switch, copy/paste, IP change, code snapshots) is rendered by `AntiCheatMonitor`'s privacy-notice dialog (`anti-cheat-monitor.tsx:286-292`) which appears only AFTER I have clicked Start, accepted the timer, and landed on the problem page.

The pre-start "review notice" uses the soft phrase: "If integrity monitoring is enabled, focus changes, copy/paste, and similar signals may be recorded." (`reviewNoticeSignals`). It does not say IP address. It does not say code snapshots. The candidate consents to the timer before they consent to the actual monitoring scope. By the time the integrity dialog appears, the timer is already running. That is the wrong order. A candidate who declines the monitoring at that point loses time they cannot get back, because the start dialog `noteTimer` warned them: "The timer begins when you click Start and cannot be paused or restarted."

**Fix:** Move the four-bullet integrity scope (`privacyNoticeTabSwitch / privacyNoticeCopyPaste / privacyNoticeIpAddress / privacyNoticeCodeSnapshots`) into the recruit page itself, before the Start button, in a collapsed "What is recorded" disclosure. Suppress the in-monitor dialog if the candidate has already consented at start time. Or, better: pause the timer until the integrity dialog is dismissed.

### F4 [C-Sev 4] — Anti-cheat monitor is not enforced and gives the candidate a worse signal-to-noise ratio than competitors

**Evidence:** `anti-cheat-monitor.tsx` is purely client-side. Events are POSTed by the browser to `/api/v1/contests/{assignmentId}/anti-cheat`. The pending queue spills to `localStorage` on network failure (`anti-cheat-storage.ts:45-69`). There is no cryptographic challenge, no server-side proof of monitor health, no detection of "monitor was killed via DevTools and submissions kept coming." `docs/exam-integrity-model.md:5-20` is candid: "These signals are advisory" and "useful review inputs, but they are not proof of misconduct on their own."

For an honest candidate the issue is the opposite of the cheating-detection failure: every accidental tab switch (look up MDN, glance at Slack to dismiss a message, alt-tab on a multi-monitor setup with side scrolling) generates a `tab_switch` event with a sonner toast warning ("Tab switch detected. An integrity signal has been recorded for review." — `messages/en.json: warningTabSwitch`). I will rack up a flag count that is not really evidence of anything (`exam-integrity-model.md:14`), but the recruiter sees a number and pattern-matches it to suspicion. The current platform's own docs say "Reserve serious sanctions for cases where multiple pieces of evidence align" (`exam-integrity-model.md:19`) but the candidate-side disclosure does not promise that — it says signals "may be recorded for review" and that hiring decisions may use submissions, timestamps, and progress (`reviewNoticeSubmissions`). The wording bias is "we'll keep everything and figure it out", with no commitment to either a corroboration standard or a false-positive appeal channel.

**Fix:** The candidate-facing notice should explicitly say (a) which signals are by themselves never disqualifying (heartbeat, blur, contextmenu — they are `"context"` and `"signal"` tier in `review-model.ts:3-12`); (b) that the recruiter's procedure requires corroboration before any negative decision; and (c) the candidate's right to an explanation. Better: stop showing the toast on every tab_switch — it is a soft punishment for a non-event that the platform's own `exam-integrity-model.md:25` calls "Context — useful for timeline reconstruction, not suspicion on its own."

### F5 [C-Sev 4] — No language time-multiplier — Java/Rust candidates get punished against Python on the same TL

**Evidence:** I grep'd the codebase for `languageMultiplier`, `tlMultiplier`, `timeLimitFactor`, `languageTimeLimit`, `extra_time` — zero hits in `src/`. Time limits are stored on the problem (`problems.timeLimitMs`) without per-language scaling. The previous applicant review (`.context/reviews/05-applicant.md`) noted this; it has not been added.

For a recruiting product this is unfair in a way that can lose hires. A candidate who picks Python because they are most fluent in it gets ~5x more headroom on the same TL than a candidate who picks Java (JIT warmup) or Rust (release-build but with rt overhead) or Kotlin (native or JVM startup). HackerRank, Codility, and CodeSignal all multiply by language. JudgeKit does not.

**Fix:** Add `languages.timeLimitMultiplier` config (e.g., python=3.0, java=2.0, c/cpp=1.0) and apply it at submission scheduling time. Surface the per-language effective TL on the problem page so candidates know what they are committing to before they pick a language.

### F6 [C-Sev 4] — No personal results / score summary page after submitting

**Evidence:** I searched for `resultsReleased`, `viewScore`, "My Results", and a candidate-facing summary route — none exist in `src/app/(dashboard)/dashboard/contests/[assignmentId]/` (the page is the same `page.tsx` the recruiter sees, gated by `canViewAssignmentSubmissions` checks at line 146). The candidate is dropped on `/dashboard/contests/{assignmentId}` after starting (`recruit-start-form.tsx:67`), but that page is structured for the recruiter (`leaderboard-table`, `anti-cheat-dashboard`, `recruiter-candidates-panel`). The candidate sees "recent submissions" on their dashboard (per `.context/reviews/05-applicant.md` line 32) and the per-submission verdict — no aggregate view, no per-problem solved/unsolved breakdown, no "you scored X / Y on visible test cases."

Once I submit, I want to know: did I solve everything? Did I almost solve problem 3? What was my time? HackerRank gives me that on the results screen. JudgeKit gives me a feed of submission rows. After investing 90+ minutes in a test for someone else, the platform owes me a one-page summary of my own performance.

**Fix:** Add `/recruit/{token}/results` rendered when `assignment.deadline < now` OR when the candidate's exam-session is finished. Show: total score, per-problem score with verdict, time used vs. allotted, anti-cheat flag count (yes — show me what they will see; transparency builds trust). Optional: my code per problem with a "download zip" button.

### F7 [C-Sev 3] — Privacy notice does not name retention windows or a deletion route

**Evidence:** `messages/en.json: reviewNoticeTitle / reviewNoticeSubmissions / reviewNoticeSignals / reviewNoticeAi` and the integrity dialog (`anti-cheat-monitor.tsx:283-292`) tell me what is captured but nothing about how long, by whom, where it is stored, or how I get it deleted. `docs/privacy-retention.md:13-21` does enumerate retention windows (recruiting records 365 days, anti-cheat events 180 days, submissions 365 days), but **none of those windows are surfaced in the candidate-facing UI**. There is no `/privacy` link on the recruit page, no GDPR/erasure email, no data-controller name. I grep'd for "GDPR", "data subject", "right to be forgotten", "deletion request" in `src/` — zero hits.

If the company is in the EU/UK or processing EU-resident candidate data, this is non-compliant. Even ignoring jurisdiction, candidates ask "how long do you keep my code?" routinely and the platform has no answer to give them.

**Fix:** Add `messages/en.json: reviewNoticeRetention` "Submissions and signals are retained for {days} days. Email {dpoEmail} to request deletion." Render with the actual configured retention from `RECRUITING_RECORD_RETENTION_DAYS / ANTI_CHEAT_RETENTION_DAYS / SUBMISSION_RETENTION_DAYS`. Add a `/privacy` route. Add a `recruiterDpoEmail` setting per organization.

### F8 [C-Sev 3] — Recruiting mode is not actually clean on the live site

**Evidence:** README:247-260 promises that in Recruiting mode, Contests / Rankings / Groups / Problem Sets are hidden for non-admin users; the navigation labels change to "Challenges" / "Attempts". probe-evidence.md confirms that `/submissions` is in the public top nav for guests but on click says "Please sign in to view your submissions" (B4) and `/rankings` exposes admin / Super Admin (B3). Neither of those is recruiting-mode-clean. probe-evidence.md also flags `/practice/problems/<bad-id>` rendering the chrome twice (B1) — a candidate following a stale URL hits a visibly broken page on the same domain hosting their test.

The platform's own README says recruiting mode hides peer-identifying data and the high-stakes operations doc says "Do not expose shared standings or peer-identifying ranking data to recruiting candidates" (`docs/high-stakes-operations.md:36`). The live deployment doesn't do that, at least at the marketing surface.

**Fix:** Verify `getResolvedPlatformMode()` actually drives the public-shell nav rendering on `algo.xylolabs.com`. The deployment may be in `homework` or `exam` global mode while individual invitations promote recruiting context — see `platform-mode-context.ts:240-260`. If so, document that the global-mode setting should be `recruiting` for the recruiting deployment. Either way, fix B1/B3 from probe-evidence.md before any candidate visits.

### F9 [C-Sev 3] — Mobile/Chromebook story is unclear

**Evidence:** `.context/reviews/05-applicant.md:34-37` flagged: side-by-side diff is `grid-cols-2` under 375px (unreadable on phones), sticky code panel breaks scroll on small screens, no offline detection or unified-diff fallback. I did not re-verify those today, but I see no mobile-targeted overrides in the recruit page (`page.tsx`) or the start form (`recruit-start-form.tsx`). The Monaco/CodeMirror editor is the only editor offered (no "type your answer in textarea" fallback). The platform requires JS (anti-cheat monitor depends on `document.visibilityState`, `addEventListener("copy")`, `addEventListener("paste")`, `localStorage`).

A candidate on a Chromebook with 4 GB RAM running Codespaces in another tab can reasonably expect to be able to take this test. A candidate borrowing a parent's iPad on the road can not — Monaco-on-iOS-Safari is a known bad time. The recruit page does not warn about this; "Make sure you have a stable connection" is the closest thing (`messages/en.json: noteCompletion`).

**Fix:** Add a system-requirements panel on the recruit page: "Use a desktop or laptop (Windows / macOS / Linux / Chromebook), Chrome 120+ or Firefox 120+, and a stable internet connection. Mobile and tablet devices are not supported for this assessment." Link to a 30-second self-check page that confirms `localStorage`, `visibilityState`, `clipboard` API.

### F10 [C-Sev 2] — "Submissions" navigation item visible to recruiting candidates

**Evidence:** probe-evidence.md, B4: header navigation shows "Submissions" as a public top-level item; clicking it shows "Please sign in." For a candidate logged into the recruiting flow, the README claims this label changes to "Attempts" (Recruiting mode column, README:258). I did not see that toggle implemented for the navigation in this review (the public-shell nav strings are in `messages/en.json: publicShell.nav.submissions`, not bound to platform-mode). If the candidate clicks it during the test they leave the contest page and their tab-switch event fires.

**Fix:** Bind public-shell nav labels to `getEffectivePlatformMode()` (already implemented for content elsewhere — e.g., `platform-mode-context.ts`). In Recruiting mode hide the Submissions link entirely from the candidate role; recruiters keep it.

## Walkthrough: invite → consent → test → results → afterwards

**Invite arrival.** Email contains a link like `https://algo.xylolabs.com/recruit/<32-byte-base64url-token>`. Invalid/revoked tokens show "Invalid link" (`page.tsx:77-97`); expired tokens show "This link has expired. Contact the organizer for a new one." with no actual contact info — if my recruiter is on PTO I have no fallback. A valid token shows a card titled "Coding Assessment" with my name ("Welcome, {name}"), the assessment title, problem count, time limit in minutes, deadline (timezone-formatted), and up to 6 enabled languages with "+N more" overflow (`page.tsx:230-247`). All of this is visible *before* authentication — see F1.

**Identity & consent.** I set an account password (min 8 chars, `recruit-start-form.tsx:20`) with the hint that I can re-login at the normal login page later. No email confirmation, no SSO, no "are you the right person" check. Pre-Start consent is two callouts: amber `noteTimer / noteSubmissions / noteCompletion` and sky `reviewNoticeSubmissions / reviewNoticeSignals / reviewNoticeAi`. No retention period stated. No mention of IP capture or code snapshots. No data controller. No deletion contact. The hard four-bullet capture list comes after Start (F3).

**Pre-test confirmation dialog** (`recruit-start-form.tsx:148-177`) shows assessment title, duration, "timer cannot be paused or restarted," and a connection-readiness check. It does NOT show the wall-clock deadline (only duration); for a 90-min test that closes at 18:00 KST I would want "you have until 14:30 KST or 18:00 KST, whichever comes first." After confirming I am redirected to `/dashboard/contests/{assignmentId}` (`recruit-start-form.tsx:67`) — the recruiter-shaped page (`page.tsx:80-282` is built around `leaderboard-table`, `anti-cheat-dashboard`, `recruiter-candidates-panel`). For a candidate role those panels are gated by `canViewAssignmentSubmissions` / `canManage` (`page.tsx:113-114, 146`) so I see fewer tabs, but the architecture is recruiter-first; the candidate sees what's left after permission strips run.

**The test itself** runs on `/practice/problems/{id}` where `AntiCheatMonitor` is mounted (`practice/problems/[id]/page.tsx:463`). CodeMirror/Monaco editor, language picker. Run posts to `/api/v1/compiler/run` with stdin and shows stdout/stderr/timing/oomKilled (`problem-submission-form.tsx:179-196`); Submit posts to `/api/v1/submissions` and the verdict streams via SSE. The integrity privacy dialog blocks the page (`disablePointerDismissal`, `showCloseButton={false}`, `anti-cheat-monitor.tsx:276-277`) until I click "I Understand" — right modal behavior, wrong moment (F3). While I work, snapshots fire every 10s while typing, every 60s when idle (`problem-submission-form.tsx:118-119`). Heartbeats fire every 30s. Tab switches fire `tab_switch` with a toast warning. Copy/paste events capture target-element class only — clipboard text content is intentionally not stored (`anti-cheat-monitor.tsx:218-220`), the right call.

**Anti-cheat scope.** Captured per UI notice: tab/window switches, copy/paste actions, IP changes, periodic code snapshots. Captured in code but not in notice: `blur` (window unfocus), `contextmenu` (right-click), 30s heartbeats, target-element class on copy/paste, full source code on snapshots (up to 256 KiB, `route.ts:14-17`). Not captured: clipboard text, keystroke timing, mouse movement, screen capture, webcam, audio. JudgeKit deliberately stops at browser-event telemetry (`docs/exam-integrity-model.md:6-10`); compared to ProctorU/Honorlock/Examity this footprint is mild and candidate-positive. False-positive risk for honest candidates is high — alt-tabbing, notification pop-ups, second-monitor glances all generate `tab_switch` events with the mildly accusatory toast "An integrity signal has been recorded for review." I cannot see what was logged about me; there is no `/recruit/{token}/my-events` page; the recruiter has the full `anti-cheat-dashboard.tsx`, I have nothing.

**Submission feedback.** Real-time SSE verdict with per-test-case results. Source visible to me, hidden from non-owners without `submissions.view_source`. Recent submissions list on the dashboard. No aggregate "you scored X/Y" summary, no "results released on {date}" notification, no per-problem solved/unsolved breakdown for me. After 90 minutes I do not know when I am done or whether the recruiter has reviewed it (F6).

**Post-test.** No closure. No "thank you" page, no submission-receipt email, no download-my-code button, no data-deletion route. Re-visiting after the deadline shows "Assessment closed."

**Dignity.** Wording is mostly neutral. Rough edges: "Couldn't start. Try again." (`startFailed`) gives no diagnostic — rate limit? expired token? the candidate guesses. The Korean translation (`messages/ko.json:2614-2663`) is competent with appropriate honorifics and no AI-translation tells; I checked for custom letter-spacing on Korean glyphs per CLAUDE.md, none applied — default font metrics. The temporary recruiter-side password copy-to-clipboard (per prior review) means my password may have been visible on a recruiter's shared screen — unforced.

**Edge cases.** Wi-Fi drop: snapshots `.catch(() => {})` silently (`problem-submission-form.tsx:115`), the editor draft survives via `useSourceDraft` localStorage, but the UI does not tell me my submission is queued or rejected. Browser crash: per-user/problem/language drafts survive in localStorage; re-entry via `/recruit/{token}` + account password gets me back (good). Past deadline: "Assessment closed."

**DevTools / lockdown.** No DevTools-block, no fullscreen-lock, no right-click-block beyond the contextmenu log. Candidate-positive — DevTools-blocking is irritation theater.

**Honest feeling.** I would take it if the company was attractive and there was no alternative. I would not if a competing offer used a more polished platform. The thing I'd mention in the post-test debrief: "I was anxious about whether tab-switching to look up syntax would count against me, and that degraded my performance." That is a structural cost of any client-side anti-cheat; the fix is a clearer commitment to the candidate about how signals are weighted.

## Privacy & data retention assessment

`docs/privacy-retention.md` lists retention windows. The ones a candidate cares about:
- Recruiting invitation records: 365 days
- Anti-cheat events: 180 days
- Submissions and grading records: 365 days

These are not surfaced in the candidate UI (F7). The deletion mechanism is the daily prune cycle (`docs/privacy-retention.md:31-37`). There is no candidate-initiated deletion route — to be deleted I would have to contact the recruiter and trust them to take an admin action. The Operator rules at `docs/privacy-retention.md:39-44` say "Do not use anti-cheat telemetry as standalone proof" and "For recruiting use, disclose that submissions, timing/progress metadata, and integrity telemetry may be reviewed." The "disclose" obligation is met (the review notice exists). The "do not use as standalone proof" obligation is operator-side and invisible to the candidate; nothing in the platform surfaces "the recruiter agreed to this rule" to me.

A reasonable candidate-facing privacy summary the platform should add:
- Who the controller is (operator/employer name)
- What is stored (submissions, code snapshots, anti-cheat events, IP)
- For how long (per the configured retention envs)
- Who can access it (named roles: recruiting staff, instructor, admin)
- How to request deletion (email)
- Right to dispute integrity signals before a hiring decision

None of those are in the UI today. The retention doc exists; the candidate-side surfacing does not.

## Fairness & accessibility assessment

**Language fairness:** Failed. No per-language TL multiplier (F5). The same TL applied to Python and Java disadvantages Java/JVM candidates roughly 2–5x. This will systematically advantage Python-mostly candidates in tight TL problems.

**Accommodations:** Failed silently. There is no admin path for "give this candidate +50% time", no documented accommodations API, no `recruiting_invitations.timeAllowanceMinutes` override I could find. Candidates who would qualify for accommodations on a standardized exam have nothing here.

**Device:** Likely OK on desktop/laptop with modern Chrome/Firefox/Safari. Likely broken on iPad/iPhone (Monaco). Not declared.

**Keyboard-only:** Not verified today; needs an audit pass. The integrity-dialog `Button` is the focus default after open which is good.

**Color-blind palette:** Not declared. The amber/sky/emerald/destructive colors used on the recruit page (`page.tsx:215-269`) are conventional Tailwind defaults and likely OK for protanopia/deuteranopia at the dialog scale, but the anti-cheat-dashboard charts and verdict badges were not audited.

**Screen reader:** Mostly OK at the form level; the integrity-monitoring side effects (toasts on tab switch) are not announced to assistive tech in the code I read. Sonner toasts default to `aria-live="polite"` but a candidate using a screen reader will get bombarded by integrity warnings if they alt-tab — that is worse than for a sighted candidate who can dismiss the toast.

## Anti-cheat invasiveness vs. necessity

JudgeKit's anti-cheat is at the polite end of the spectrum. It does not require camera, microphone, screen share, or a lockdown browser. It does not block DevTools. It does not capture clipboard text. It does not capture keystroke timing. It does not lock the screen. Compared to ProctorU / Honorlock / Examity / Mettl-with-AI, JudgeKit is dramatically less invasive.

The cost of that politeness is exactly what `docs/exam-integrity-model.md:5-10` says: this is not proctoring, it is telemetry. The signals are noisy, easily bypassed (`.context/reviews/05-applicant.md:48-63`), and useful only as a review aid. The platform is honest about that internally; it is less honest about that externally — the candidate-facing notice does not say "these signals will not be used as standalone proof", which would be a reasonable promise to make.

For the candidate, the trade-off is favorable. I would much rather have JudgeKit's "we'll log your tab switches" than a webcam-watching AI proctor flagging me for looking away from the screen. The improvement I want is the *commitment*: tell me explicitly what does and does not constitute disqualification.

## Compared to HackerRank / Codility / CodeSignal

| Dimension | HackerRank | Codility | CodeSignal | JudgeKit |
|---|---|---|---|---|
| Employer branding on test start page | Yes | Yes | Yes | **No** |
| Pre-start integrity disclosure | Yes (one screen) | Yes | Yes (very thorough) | Partial (notice exists, hard list is post-Start) |
| Per-language TL multiplier | Yes | Yes | Yes | **No** |
| Candidate results page | Yes | Yes | Yes | **No** |
| Code snapshots / autosave | Yes | Yes | Yes | **Yes** (10s/60s) |
| Re-entry on disconnection | Yes | Yes | Yes | **Yes** |
| Webcam proctoring option | Yes (CertifiedHire) | Yes | Yes | **No** (intentional) |
| Lockdown / fullscreen lock | Optional | Optional | Optional | **No** |
| Mobile support | Yes (limited) | No | No | **Untested** |
| GDPR data subject route | Yes | Yes | Yes | **No** |
| Accommodations (extra time) | Yes | Yes | Yes | **No** |
| AI assistant disabled in test | N/A | N/A | Yes | **Yes** (default) |
| Open-source / self-hostable | No | No | No | **Yes** |

Where JudgeKit wins: cost (self-hosted), low integrity invasiveness, AI-disabled by default, code snapshot autosave is at parity. Where it loses: branding, results, language fairness, accommodations, GDPR. The losses are all surface-area features that do not require deep engineering — they require product investment.

## Recommended fixes prioritized by candidate impact

### Tier 1 — block launch as a recruiting product to external candidates

1. **F1 (name leak via OG/welcome before auth)**. One-day fix in `page.tsx:23-58, 118-119`.
2. **F2 (no employer branding)**. Add `organization_name` / `organization_logo_url` / `recruiter_contact_email` to the invitation; render on every recruit-page state.
3. **F5 (per-language TL multiplier)**. Fairness, not polish: same TL on Python vs Java measures different things.
4. **F6 (candidate results page)**. Add `/recruit/{token}/results` after deadline with per-problem score, time used, my code.

### Tier 2 — required before claiming GDPR-compliant or accessible

5. **F7 (retention/deletion in candidate UI)**. Add `reviewNoticeRetention` string with actual values; add `/privacy` and `recruiterDpoEmail` setting.
6. **F3 (move integrity disclosure before Start)**. Render four-bullet capture list inline on the recruit page.
7. **Accommodations API (extended time)**. Schema column on `recruiting_invitations`, admin UI, runtime enforcement on `examDurationMinutes`.

### Tier 3 — significant candidate-experience wins

8. **F4 (calmer integrity wording)**. Surface `reviewModelTelemetry / reviewModelCorroboration` (`messages/en.json:2153-2155`) to the candidate. Add a "what was logged about me" view.
9. **F9 (system-requirements panel + browser/device self-check)**.
10. **F10 (recruiting-mode nav cleanup)**. Bind public-shell nav labels to `getEffectivePlatformMode()`.

### Tier 4 — polish

11. Organization-aware emergency contact on every error/expired card.
12. Wall-clock deadline display in start dialog.
13. "Your code is auto-saved every few seconds" microcopy on the editor.
14. Soften `warningTabSwitch` toast from "An integrity signal has been recorded for review" to "Activity recorded: tab switch."
15. Fix probe-evidence.md B1/B3/B4 before any candidate visits — same domain, same impression of engineering culture.

JudgeKit Recruiting Mode has solid foundations: autosave, re-entry, honest privacy disclosure, AI-off by default. The gaps are almost all on the candidate-facing surface, where this product was clearly evolved from a classroom tool rather than designed for external evaluation. Most of Tier 1 is one to two engineering weeks; landing it converts JudgeKit from "internal tool used externally" into a credible answer to "should we use HackerRank or self-host."
