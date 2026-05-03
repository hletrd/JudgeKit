# Job Applicant Perspective Review

**Date:** 2026-05-03
**Persona:** A working software engineer being asked to take a JudgeKit-hosted coding test as part of a job interview. Reasonably savvy, has done HackerRank / Codility / CoderPad assessments before. Knows what good looks like.
**Method:** Read `src/app/(auth)/recruit/[token]/page.tsx`, `src/lib/recruiting/`, `src/lib/auth/recruiting-token.ts`, the recruit results page (`/recruit/[token]/results/page.tsx`), `src/lib/platform-mode.ts`, and prior applicant reviews.
**Posture:** Critical. This is a candidate experience review. If the platform is annoying, I drop out and the company loses talent.

---

## TL;DR

JudgeKit's recruiting flow is honest, well-branded, and structurally sound. It is also missing two table-stakes features that competitors shipped years ago — autocomplete in the editor and a lockdown-browser story — and one privacy nicety (silent code snapshots that the docs disclose but the UI does not surface). For a screening-stage assessment this is fine. For a final-round assessment that decides whether someone takes a $150k job, this is not enough.

| Stage | Score | One-line |
|---|:---:|---|
| Initial-round screening (1 h, low stakes) | 7.0 | Acceptable. |
| Mid-funnel take-home (4-24 h) | 6.5 | Acceptable. |
| Final-round on-site / live (2-4 h, decisive) | 5.0 | Bring lockdown browser; this is not it. |

Aggregate: **6.5 / 10**.

---

## Invitation flow (8 / 10)

- The recruit landing page (`recruit/[token]/page.tsx`) renders org logo, name, contact email — feels professional, not "we're a startup with a hand-rolled SaaS".
- Available languages are shown as badges with a count overflow ("plus 28 more"). Candidate can decline if their preferred language is missing.
- The "Review Notice" disclosure (lines 285-294 per the explore findings) honestly enumerates what is logged: tab switches, copy/paste, IP changes, code snapshots. It also explicitly says these are signals for human review, not proof of cheating. This honesty is *unusual* in the industry and is the right posture.
- Token is a 24-byte base64url (≈192 bits) — cryptographically sound. SHA-256 hashed in DB. Single-use redemption gate is atomic.
- Expiry is server-side via DB `NOW()`, so no client-clock funny business.
- OG metadata on the invite URL is generic — no candidate name leaked if the URL is screenshotted.

Pain points:
- Token URL forwarding works. If a recruiter sends the URL to alice@gmail.com and alice forwards it to bob@gmail.com, bob can take the test as alice. There is no email-based out-of-band verification.
- Once the candidate sets their password (8 chars min, no strength meter), the password becomes the gate. No 2FA on the candidate side.
- The page body shows "Welcome, {candidateName}" on the resume path, so screenshots after login do leak the candidate name. Minor.

---

## Test-taking experience (6 / 10)

- Server-time-synced countdown. Clock skew on my laptop does not buy me time. Per-problem split pane (statement left, editor right) is conventional.
- Recent submissions panel shows last 5 with status badges.
- Candidate sees their own work only. No leaderboard, no ranking against other candidates. This is correct for recruiting.

Pain points:
- **No timer on the dashboard view.** I have to navigate to a problem to see the time remaining. Anxious behavior follows.
- **No "saved N seconds ago" indicator.** Code-snapshot POSTs are silent. I do not know whether my last 30 seconds of work survived.
- **No per-problem progress meter** ("3 of 5 attempted"). I have to count.
- **Submission cancel window is 4 seconds.** Reflexive ⌘+Enter → "wait, no" is fine for me; for someone unfamiliar with the convention it is one more thing.
- **Mobile is rough.** I would not voluntarily take a recruiting test on my phone. See `08-responsive-live.md` for evidence.

---

## Editor (5 / 10) — the single biggest weakness

This is the deal-breaker, in my honest opinion as a candidate. JudgeKit ships CodeMirror with:

- 30+ themes, 9 font families, syntax highlighting, fullscreen mode, autosave drafts.
- Smart newline insertion, bracket dedenting.
- Ctrl/⌘ + Enter submit, F = fullscreen, ? = help.
- Per-language code templates.

What it does NOT ship:

- **No autocomplete / IntelliSense.** None. `@codemirror/autocomplete` is a one-line config. Not enabled.
- **No bracket auto-close.** Same package family, not enabled.
- **No code folding.** Same.
- **No find-and-replace.** Same.
- **No multi-cursor.** Same.
- **No vim / emacs keybindings.** Disqualifying for many candidates.
- **No inline lint / type-check.** I waste a queue slot to find a typo.
- **No font-size button in the UI.** The prop exists; the button doesn't.

The platform is *technically capable* of these. They are CodeMirror extensions. They are not turned on. As a candidate, this signals "the company building or hosting this assessment is OK with me typing `System.out.println(` character by character on a 75-minute clock".

Compared to the table:

| Feature | JudgeKit | HackerRank | CodeSignal | CoderPad |
|---|:---:|:---:|:---:|:---:|
| Autocomplete | ❌ | ✅ | ✅ | ✅ |
| Bracket auto-close | ❌ | ✅ | ✅ | ✅ |
| Vim/emacs | ❌ | ✅ | ✅ | ✅ |
| Multi-cursor | ❌ | ✅ | ✅ | ✅ |
| Find / replace | ❌ | ✅ | ✅ | ✅ |
| Code folding | ❌ | ✅ | ✅ | ✅ |

This puts JudgeKit's editor at roughly 2018-tier. For a 2026 platform that's marketing recruiting use, it is the single biggest gap.

---

## Anti-cheat & integrity (6.5 / 10)

The good:
- Heartbeat freshness is enforced server-side at submission time (recent commit `a88f640b`). The naive "queue submissions from a script while my browser sits idle" attack is closed.
- Heartbeat dedup at 60 s prevents flood (`anti-cheat/route.ts:91-101` per explore findings).
- Code snapshots every 10-60 s give the recruiter a deltas-over-time record. Useful for dispute resolution.
- Tab switch / blur / paste / right-click events all logged with a tier (context / signal / escalate).

The bad:
- **No lockdown browser.** I can have ChatGPT open on a second laptop, on my phone, on a dual-monitor PiP overlay. Heartbeat keeps green throughout. This is not stopped, not even slightly.
- **Heartbeat is browser-side and trivially scriptable.** A motivated attacker uses Playwright to drive the page and a second device to consume the AI output. The platform has no cryptographic challenge that ties the heartbeat to a real browsing session.
- **No AI-generated-code detection.** Code-similarity is Jaccard n-gram, which compares two human-written submissions; ChatGPT outputs from two candidates will look unrelated.
- **No keystroke-dynamics analysis.** Some competitors ship this; here it does not exist.
- **VPN flagging.** A heartbeat from a different IP gets logged as a "signal" event. A candidate using a corporate VPN looks suspicious. Privacy-respecting candidates pay a tax.

The honest framing:
- The platform's `docs/exam-integrity-model.md` explicitly says these signals are telemetry, not prevention. As a candidate I respect that. As a recruiter relying on the platform to validate "this candidate didn't cheat", it is insufficient on its own.

---

## Results delivery (7 / 10)

- `/recruit/[token]/results/page.tsx` exists and is auth-gated. After the deadline (and if the recruiter has `showResultsToCandidate = true`), I can see:
  - Total score
  - Per-problem breakdown
  - My best submission per problem (language, runtime, timestamp, verdict)
  - Org name, org contact email
- `hideScoresFromCandidates` toggle gives the recruiter a "results hidden" mode.
- No leaderboard, no peer-comparison. Correct for recruiting.

Gaps:
- No notification when results are released. I check periodically.
- No per-test-case breakdown ("you passed 7/10 visible cases"). Most competitors show this.
- No qualitative feedback ("0-50 = below bar, 50-75 = bar, 75+ = strong"). I just see a number.
- No appeal / contact form. If I think a test case was wrong I have to email the org.
- No "PDF report" download.

---

## Privacy (7 / 10)

- A `/privacy` route exists and documents what is collected, retention windows, and a contact email. Recent commit `24bc5f85` cross-links the privacy page from the recruit landing page.
- Anti-cheat events: 180 days. Recruiting records: 365 days. Submissions: 365 days. Daily pruner with legal-hold flag.
- Documented as honest. Better than the average opaque competitor.

Gaps:
- No first-party data-subject-request endpoint. Privacy page says "email us", which is correct but slow.
- Code snapshots are silent — no per-snapshot indicator and no opt-out.
- IP address retention with heartbeats is comprehensive, including periods where I might be on a hotspot or VPN.
- Google Analytics loads if `NEXT_PUBLIC_GA_MEASUREMENT_ID` is set. There is no consent gate for this in the recruit flow per the explore findings. For an EU candidate, this is a process problem.
- The recruiter's `resetRecruitingInvitationAccountPassword` flow shows a temporary password as plaintext in the recruiter UI with a copy-to-clipboard button. If the recruiter is screen-sharing during a debrief, the password leaks.

---

## Standalone compiler & platform mode (8 / 10)

- `/playground` is blocked in recruiting mode (`platform-mode.ts:19-20`).
- `/api/v1/compiler/run` returns 403 in recruiting mode.
- AI code review is disabled by default in recruiting mode (verified per README).
- Both UI and API enforcement — consistent.

Gap: a candidate with the auth token from their browser session could `curl` arbitrary paths if they enumerate. The 403 on the playground endpoint defeats the obvious abuse, but the broader principle of "recruiting mode hides Contests / Rankings / Groups" relies on UI redirects, not API-side denial in every case. Worth a defense-in-depth pass.

---

## Localization (8 / 10)

- Pretendard font for Korean rendering — looks correct.
- `next-intl` for UI translation, `SUPPORTED_LOCALES = ["en", "ko"]`.
- Recruiter must author bilingual problem statements if needed; the platform doesn't translate problem bodies for me.

---

## Browser support / lockdown (4 / 10)

- No SEB integration.
- No browser allowlist (Chrome / Safari / Firefox / Edge / Brave / Arc / Vivaldi all work).
- No extension blocking. Codeium and Copilot are not detected, much less prevented.
- No keyboard / mouse lockdown. Alt-Tab freely. Window-snap freely.

This is THE differentiator versus tier-1 competitors. JudgeKit's heartbeat enforcement is band-aid in comparison.

---

## Competitive positioning

| Feature | JudgeKit | HackerRank | CodeSignal | CoderPad |
|---|:---:|:---:|:---:|:---:|
| Invitation onboarding | 8 | 8 | 7 | 8 |
| Editor autocomplete | **0** | 9 | 10 | 9 |
| Live results page | 7 | 7 | 8 | 8 |
| Lockdown browser | **0** | 8 | 9 | 10 |
| Server-side anti-cheat | 5 | 7 | 8 | 9 |
| AI-detection | **0** | 5 | 7 | 6 |
| Privacy transparency | **8** | 4 | 4 | 6 |
| Anonymized export | **8** | 5 | 5 | 6 |
| Mobile candidate UX | 5 | 8 | 5 | 4 |
| Live-coding video / chat | **0** | 7 | 8 | **10** |

JudgeKit *wins* on privacy transparency and on having an anonymized export option (the recruiter can review without seeing names). It *loses* on every editor and proctoring dimension.

---

## What would make me drop out as a candidate

1. **Final-round 2-hour assessment with no autocomplete.** I would (politely) ask the recruiter for an alternative. Typing Java by hand under pressure is a measurement of typing speed, not engineering ability.
2. **No lockdown browser, but invasive monitoring.** The combination "we will log everything but we cannot actually stop a cheater" is the worst of both worlds for an honest candidate. I am penalized for the existence of dishonest candidates with no actual reduction in their advantage.
3. **No timer on the dashboard view.** Five minutes of "wait, how long do I have left" anxiety is cumulative.

---

## What I would change for "real-final-round" mode

In priority order:
1. **Enable CodeMirror autocomplete + bracket auto-close + find/replace.** One-day change. Single biggest perceived-quality lift.
2. **Add SEB integration as an opt-in for high-stakes assessments.** Honestly disclose to candidates: "this assessment requires SEB; download here".
3. **Add an always-visible timer + "saved N seconds ago" widget** that follows the candidate across pages.
4. **Add a per-test-case breakdown** on the results page.
5. **Add a candidate-side data-subject-request endpoint** for GDPR compliance, even just "email a dump of my data".
6. **Add an opt-in vim mode** in the editor.
7. **Add per-snapshot consent / opt-out**, even if the default is on.
8. **Reduce password reset UI exposure** of plaintext temp passwords.

---

## Bottom line

JudgeKit is a *defensible* recruiting platform for screening (1 h, low stakes). It is *not* a defensible platform for final-round decisions versus tier-1 competitors today. The gaps are not architectural — they are CodeMirror extensions and an SEB integration. They are achievable in a sprint. Until they are done, JudgeKit is HackerRank's 2018 sibling, not its 2026 peer.
