# Student Perspective Review

**Date:** 2026-05-03
**Persona:** Undergraduate CS student using JudgeKit for homework, classroom exams, programming contests, and self-practice. Some sessions on a desktop, some on a phone between classes.
**Method:** Read source under `src/app/(public)/`, `src/app/(dashboard)/`, `src/lib/anti-cheat/`, plus existing reviews in `.context/reviews/2026-05-03-multi-perspective/01-student.md` and `persona-student-2026-04-20.md`. Live UX of the production deploy is covered separately in `08-responsive-live.md`.
**Posture:** Critical. The bar is "would I want to take a final exam on this if my GPA depends on it?"

---

## TL;DR

JudgeKit is a perfectly competent submission-judging engine. As an *educational* tool, it teaches you nothing. As an *exam* platform, it produces enough anxiety per second that the platform itself becomes a confound. As a *contest* platform it is genuinely good, modulo mobile.

Per use case (1-10):

| Use case | Score | One-line verdict |
|---|:---:|---|
| **Homework / weekly assignments** | 7.5 | Submission flow is solid. No hints, no learning loop. |
| **Classroom exams** | 6.0 | Server-time countdown is real. Anti-cheat is theatre. No safe-tab-close recovery. |
| **Programming contests** | 7.5 | ICPC + IOI + freeze + per-language TL. Mobile remains weak. |
| **Recruiting (as candidate)** | 6.5 | Honest disclosures, decent results page, no autocomplete, no lockdown browser. |
| **Self-practice** | 7.0 | Practice page exists but is detached from the dashboard. Editorials are mostly empty. |

Aggregate: **6.9 / 10** — works, but is not where I would want to live for four years of CS coursework.

---

## What is genuinely good

1. **Server-time-synced countdown.** `/api/v1/time` returns `EXTRACT(EPOCH FROM NOW())` from the DB, and the route is `dynamic = "force-dynamic"` (README §"Time Synchronization"). I cannot just put my system clock back five minutes to win an exam. Almost every cheap online judge gets this wrong.
2. **Per-language time-limit multipliers** (commit `e48c2f33`, doc `docs/languages.md`). Python is no longer reflexively TLE'd against the C++ baseline. As a Python-first student in a C-tradition department, this matters.
3. **Heartbeat freshness check at submission time** (commit `a88f640b`). The naive "I'll just `curl` the submission API from another tab while the exam page sits idle" attack is closed at the server. Note the residual problem in §"Anti-cheat reality check" below.
4. **Draft auto-persistence** in localStorage (`useSourceDraft` hook). My laptop crashes, I come back, my code is still there.
5. **Explicit submit-cancel window** (4 seconds). Reflexive ⌘+Enter → "wait, no" works as expected. Small, but it has saved me.
6. **i18n actually works.** `SUPPORTED_LOCALES = ["en", "ko"]` with full message catalogs under `messages/`. As a Korean student in a Korean department I am not reading machine-translated mush.
7. **Real-time submission feedback** (SSE with polling fallback in `useSubmissionPolling`). Queue position, per-test-case progress, no need to F5 my own grade.

---

## What is structurally missing

### 1. Zero educational scaffolding (HIGH)
Wrong-answer feedback is a verdict and (sometimes) a diff against expected output. There is no:
- Hint system. The problem author can write hints in the markdown body, but the platform has no concept of progressive disclosure.
- Editorial / walkthrough hook. The practice page has an editorials tab; it is empty for almost every problem in the live deploy.
- Mistake taxonomy. "Wrong on test 3" with no idea whether test 3 stresses a corner case, a perf case, or a different algorithm class entirely.
- Concept tags surfaced to me as a learner. Tags exist in the schema; they are barely used in the student UI.

For a course that actually wants students to *learn*, this is a significant deficit relative to PrairieLearn, OpenDSA, CodeStepByStep, or even BOJ's editorial culture. JudgeKit is not a learning environment; it is a grading engine.

### 2. Exam recovery story is missing (HIGH)
- If my browser tab dies during an exam, my draft is in localStorage but **the exam UI does not advertise this**. I will panic.
- There is no "you have N minutes remaining, your last save was M seconds ago" widget on the exam page.
- There is no offline indicator. If WiFi drops, I see generic toasts. I do not know whether my last submission landed.
- The submit endpoint does not surface a clean retry path on transient network failure. I either re-submit (risking a duplicate flagged by anti-cheat) or sit and pray.

### 3. Anti-cheat reality check (HIGH)
What is actually detected, per `src/lib/anti-cheat/`:
- `visibilitychange` (tab switch)
- `blur` (window blur)
- `copy` / `paste`
- `contextmenu`
- 30 s heartbeat (`HEARTBEAT_INTERVAL_MS`), with submission requiring a heartbeat ≤ 60 s old.

What is NOT detected, and any motivated cheater will use:
- A second laptop or phone with ChatGPT open. The exam tab keeps emitting a clean heartbeat the whole time.
- Picture-in-picture / split-screen on any modern OS. No fullscreen lock, no Safe Exam Browser integration.
- Browser extensions (Codeium, Copilot, etc.). The page does not enumerate or block them.
- Scripted heartbeats via Puppeteer or a userscript. The heartbeat carries no cryptographic challenge tied to the page session.

The platform's own `docs/exam-integrity-model.md` is honest about this; it explicitly says these signals are telemetry, not prevention. As a student, I should *prefer* this honesty — it means I am not being told a falsehood about being "secure". As an honest student in the same room as a cheater, it is also depressing.

### 4. The editor is bare CodeMirror (MEDIUM)
- No autocomplete. None. In Java, this is a measurable speed disadvantage versus any other modern OJ.
- No bracket auto-close, no auto-indent improvements beyond CodeMirror defaults.
- No vim/emacs keybindings. Competitive programmers expect at minimum vim mode.
- No inline lint or syntax checking before I submit and waste a queue slot.
- No font-size control in the visible UI. The prop exists but is not surfaced. Students with vision issues are reaching for browser zoom, which then breaks layout.

### 5. Practice page is detached from the dashboard (MEDIUM)
`/practice/problems/[id]` has the editorials tab, similar-problem suggestions, and the keyboard shortcuts cheatsheet. `/dashboard/problems/[id]` (which is what the assignment links point at) does not. There is no link between them. As a student I literally only discover this by mis-typing a URL.

### 6. Mobile remains a real weakness (MEDIUM, see `08-responsive-live.md`)
- Sticky code panel competes with mobile address-bar collapse.
- Tables (problems, submissions, rankings) want a card-on-mobile fallback they don't have.
- Side-by-side diff is unreadable on a phone; no unified-diff toggle.
- The on-screen keyboard pushes the submit button off-screen on small viewports — see the live responsive review for evidence.

### 7. Notifications are pull-only (MEDIUM)
There is no email/push for:
- "Assignment due in 24 hours."
- "Your TA replied to your appeal."
- "Your contest submission was rejudged."
I have to log in and check. This is fine for one course; it is a drag for five.

### 8. Korean rendering hygiene (LOW, but pointed)
`CLAUDE.md` explicitly warns not to apply `letter-spacing` to Korean glyphs. This means somewhere, at some point, somebody applied Latin-only typography to Korean and it shipped. I'd like to see this codified in lint, not in a project memory file.

---

## Concrete frustrations during a high-stakes exam

These are the things that produce real heart-rate increases:

1. **No "your code was just saved" indicator.** I have no idea whether my last 30 seconds of typing made it to the server. The code-snapshot POSTs are silent.
2. **Time sync is one-shot.** `/api/v1/time` is called at page load. If your tab is open for 90 minutes, you have *implicit* drift between the in-page countdown and the server. The check at submit time is the only true authority — but my brain has been trusting the countdown for 90 minutes.
3. **Run output truncates without telling me how much was hidden.** "Show more / less" without "showing 2000 of 18000 characters" is small thing that wastes my time.
4. **Heartbeat / anti-cheat events are not surfaced to me.** If the platform decides I tab-switched, I do not get a "we logged a tab-switch event" toast. So I cannot self-correct, and I cannot prove later that I didn't (e.g., "no, that was the proctoring extension, not me").
5. **Contest cancel + re-submit risk.** With the 4-second cancel window I now have a tiny but non-zero risk of producing duplicates or "this was cancelled" entries that look weird in the audit trail. For an honest student this should be friction-free; right now it adds one more thing to think about under pressure.

---

## What is good for contests specifically

- ICPC and IOI scoring both implemented end-to-end. Frozen scoreboard exists.
- Per-language time limits actually behave on judge. My Kotlin solution is not magically TLE because the limit was calibrated to GCC.
- Server-time countdown is global, not "your computer's idea of midnight".
- Submission queue position is visible. I know whether I am waiting on me or on the system.
- ICPC penalty calc and IOI subtask weighting both look right at the schema layer.

---

## What is good for recruiting (as a candidate)

Covered in detail in `05-applicant.md`. From a student-who-is-also-a-job-candidate perspective:

- The recruit landing page is honest about what is monitored. I know going in.
- Languages available are visible upfront. I can refuse the test if my preferred language is missing.
- A results page exists (`/recruit/[token]/results/page.tsx`). Many competitor platforms hide this; JudgeKit shows it (configurably).
- No leaderboard for recruiting. I am not competing live with other candidates I do not know.

---

## Per-use-case summary

| Capability | Homework | Exam | Contest | Recruiting |
|---|:---:|:---:|:---:|:---:|
| Submission flow quality | A | A | A | A- |
| Editor quality | C+ | C+ | C+ | C+ |
| Anti-cheat appropriate to stakes | n/a | C-* | B | C+ |
| Recovery from network/tab failure | C | C | C | C |
| Result clarity | B | B | A | B+ |
| Mobile usability | C | D | C | C |
| Educational value | F | n/a | n/a | n/a |
| Time-pressure honesty | A | A | A | A |
| Localization | A | A | A | A |

\* C- because it is *honest* C, not lying-A.

---

## Recommendations from this persona

In priority order, the changes that would make the biggest difference for a student:

1. **Persistent "saved N seconds ago" indicator** during exams and any timed assignment. Cheap, removes the largest single source of anxiety.
2. **Continuous server-time re-sync** every 60 s, not one-shot at page load.
3. **Tab-close recovery dialog** that announces "your draft is saved, continue?" on re-entry. Make the localStorage draft visible.
4. **Network-failure submit retry** with exponential backoff and a client-side dedupe key on the submission.
5. **Surface anti-cheat events to the student** in real time. If I'm being flagged I want to know now, not when I see my exam zero.
6. **Editor enable autocomplete** (`@codemirror/autocomplete`) — a one-day change with massive perceived-quality lift.
7. **Mobile fixes** — see `08-responsive-live.md`. Especially the sticky-panel + soft-keyboard interaction.
8. **Editorial hooks on `/dashboard/problems/[id]`**, parity with `/practice/problems/[id]`.
9. **Hint system** — even a per-problem instructor-curated 1-line hint, gated behind a "show hint (-10%)" button.
10. **Email notifications** for deadlines and replies. Opt-in, course-scoped.
