# Student Review — JudgeKit — 2026-05-15

**Reviewer persona:** Undergraduate CS student using JudgeKit for course assignments, programming exams, self-practice, and internal contests. Expects the platform to work at 2 a.m. during a deadline, on a flaky WiFi connection, with a Chromebook or ARM Mac.
**Method:** Inspected student-facing code paths in `src/app/(public)/`, `src/app/(dashboard)/dashboard/`, `src/lib/assignments/`, `src/lib/compiler/`. Compared against BOJ, Codeforces, AtCoder, Domjudge, HackerRank.
**Scope:** UX fairness, learning support, accessibility, frustration points.

## Verdict (1-10) per use case

| Use case | Score | One-line summary |
|---|---|---|
| Practice (self-study) | **7/10** | 125 languages, per-language templates, server-time sync, and similar-problems are strong. Guest playground still broken (auth wall). Korean/English mixing in catalog still unaddressed. |
| Homework (assignment) | **7/10** | Deadlines, late penalties, personal countdowns, and code drafts are well-executed. No rate-limit feedback UI, no "what counts as submitted" explanation, and anti-cheat is invisible until it isn't. |
| Exam (windowed/proctored) | **5.5/10** | Heartbeat freshness (90s) is a real improvement since May 3. Still no recovery path for accidental tab-close, no exam-mode lockdown UI, and the start flow assumes the student has read the docs. |
| Contest (timed competitive) | **7/10** | Server-synced countdown, IOI/ICPC scoring, leaderboard freeze, and real-time SSE are competitive with Codeforces. No virtual-contest mode, no public participant list pre-start, and single-worker SPOF is an operational risk. |

**Overall student utility: 6.5/10.** This is a working OJ that handles the core loop competently. It is not yet a platform a student would actively recommend to peers for learning — the pedagogical scaffolding (hints, error-pattern explanations, mastery tracking) is absent.

---

## Top 5 things that work well

1. **Heartbeat freshness enforcement for exams.** `ANTI_CHEAT_HEARTBEAT_FRESHNESS_MS = 90_000` at `src/lib/assignments/submissions.ts:54` means a student whose browser monitor goes stale cannot accidentally submit from a stale session. This prevents the "I forgot to open the exam tab" footgun. The throttle is 60s on the client, leaving 30s buffer for jitter — correctly tuned.

2. **Per-language smart templates with replacement detection.** `src/lib/judge/code-templates.ts` ships idiomatic starter code for 17 languages. C++ gets `ios_base::sync_with_stdio(false)`, Python gets `sys.stdin.readline`, Java gets `BufferedReader`. Switching language preserves handwritten code. This is genuinely better than BOJ's empty editor.

3. **Code draft persistence with 7-day TTL.** `useSourceDraft` in `src/components/problem/problem-submission-form.tsx` keeps code in `localStorage`. `useUnsavedChangesGuard` warns before navigating away. Students *will* close tabs accidentally; this saves them.

4. **Detailed verdict feedback with educator-controlled granularity.** `showDetailedResults`, `showRuntimeErrors`, `showCompileOutput` toggles on the problem model let an instructor dial feedback up for practice and down for exams without code changes. The status badge renders WA-with-case-index, TLE-with-time-vs-limit, RE-with-signal-type, and CE-with-compiler-output.

5. **Server-time-synced countdown.** `GET /api/v1/time` returns DB-server epoch time, not app-server time. A student with a 90-second laptop clock drift still sees the truth. The unit test at `tests/unit/api/time-route-db-time.test.ts` pins this contract. Real fairness issue, handled correctly.

---

## Top 8 student frustrations (severity + fix)

### F1. Guest playground is still an auth wall (HIGH — unfixed since May 3)
**Where:** `src/app/api/v1/compiler/run/route.ts` (playground POST requires `content.submit_solutions` capability).
The public homepage and playground page still advertise "no sign-in required." A guest who clicks Run gets 401 with no helpful error. This is the single most common onboarding gesture, and it is broken.
**Fix:** Build a guest playground with IP-based rate limiting (1 req/30s, 64KB source, no DB writes), OR remove the false-advertising copy.
**ETA:** 4 hours for true guest mode; 15 minutes for copy fix.

### F2. 404 pages under `(public)` still double-render chrome (HIGH — unfixed since May 3)
**Where:** `src/app/(public)/layout.tsx`, `src/app/not-found.tsx`.
Every 404 in the public route group renders two headers and two footers. Status is HTTP 200 (soft-404). Screen readers see duplicate landmarks. First impression is unprofessional.
**Fix:** Create `src/app/(public)/not-found.tsx` with inner content only, no chrome.
**ETA:** 30 minutes.

### F3. `/submissions` in public nav is a sign-in wall (MEDIUM — unfixed since May 3)
**Where:** `src/app/(public)/submissions/page.tsx`.
The public header lists Submissions next to Practice, Playground, Contests. Clicking it as a guest shows "Please sign in." This is a navigation lie. Public submission feeds are valuable for learning ("how did the top scorer solve this?").
**Fix:** Build a public submissions feed showing verdict, language, and execution time — hide source code. Or remove from public nav.
**ETA:** 3 hours.

### F4. Practice catalog mixes Korean and English when locale=en (MEDIUM — unfixed since May 3)
**Where:** `src/app/(public)/practice/page.tsx`.
Problem titles like `첫 번째 프로그램`, `세 수의 합` appear alongside English UI strings. No translation, no filter, no transliteration. A non-Korean student cannot navigate the catalog.
**Fix:** Add `language` filter chip; backfill English titles for top-50 problems.
**ETA:** 4 hours.

### F5. No recovery path for accidental tab-close during exam (HIGH)
**Where:** `src/app/(dashboard)/dashboard/exams/[id]/page.tsx`.
If a student accidentally closes their exam tab, re-opening it shows the exam page but there is no "Resume session" guidance. The countdown continues. The anti-cheat monitor restarts. The student panics.
**Fix:** On exam entry, detect an existing `examSessions` row for `(userId, assignmentId)` and show a "Resume your session — your timer is still running" banner with the remaining time.
**ETA:** 2 hours.

### F6. No explanation of what "submitted at deadline" means (MEDIUM)
**Where:** `src/lib/assignments/submissions.ts`.
The server uses `getDbNowUncached()` for deadline checks. A student submitting with 1 second left may see "deadline exceeded" if their packet arrives after the DB clock ticks. There is no UI explaining this.
**Fix:** Add a tooltip near the countdown: "Submissions are timestamped by the server when received. Submit with at least 10 seconds remaining to avoid clock skew."
**ETA:** 30 minutes.

### F7. Rate limit feedback is invisible (MEDIUM)
**Where:** `src/app/api/v1/submissions/route.ts`.
When `consumeApiRateLimit` returns a block, the student sees a generic error. There is no "You have N submissions remaining this minute" indicator, no "Try again in 45 seconds" countdown.
**Fix:** Return rate-limit metadata in the 429 response and render it in the submission form.
**ETA:** 2 hours.

### F8. No keyboard-shortcut documentation (LOW)
**Where:** CodeMirror editor in `src/components/editor/`.
The editor supports Ctrl+Enter to submit, but there is no visible hint. Students discover it by accident or not at all.
**Fix:** Add a small "Ctrl+Enter to submit" hint below the editor, dismissable.
**ETA:** 30 minutes.

---

## Accessibility gaps

- **Duplicate landmarks on 404s**: Two `<header>` and two `<footer>` elements on public 404s (WCAG 2.4.1 violation).
- **Color alone for verdict status**: Accepted (green) vs Wrong Answer (red) uses color only; no icon or text prefix for colorblind users.
- **Countdown timer is a live region but not polite**: The exam countdown updates every second and may spam screen readers. Should use `aria-live="polite"` with throttled updates (every 10s for screen readers).
- **CodeMirror lacks aria-label**: The editor textarea has no accessible name describing what it is for.
