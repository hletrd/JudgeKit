# Student Perspective Review — JudgeKit

**Reviewer persona**: Undergraduate CS student using this for coursework, exams, contests, and self-practice.
**Date**: 2026-05-03
**Compared against**: April 17 review, Codeforces, BOJ, HackerRank, PrairieLearn
**Method**: Full codebase audit of student-facing paths + live probing

---

## Score by use case

| Use case | Score | One-line |
|---|---|---|
| Practice (self-study) | 7/10 | Catalog, similar-problems, and templates are strong; mixed Korean/English still hurts discoverability |
| Homework (assignment) | 7.5/10 | Deadline UX, late penalties, bulk operations work; per-language TL multipliers now fair |
| Exam (windowed/proctored) | 6.5/10 | Heartbeat enforcement is real; no lockdown browser, no exam-recovery UI for accidental tab close |
| Contest (timed competitive) | 7.5/10 | Server-time countdown, ICPC/IOI, freeze; still no virtual contest mode |

**Overall: 7.5/10**

---

## What got better since April 17

1. **Per-language time-limit multipliers** (`languageConfigs.timeLimitMultiplier`). Python no longer gets unfairly TLE'd against C++. This was a top fairness complaint and it's now fixed at the schema + judge level.
2. **4-second cancel window for submissions** (`5f7fbef5`). The "Oh no I submitted the wrong file" panic now has a brief undo. This is a quality-of-life win that most OJs don't have.
3. **Platform-aware Cmd/Ctrl+Enter shortcut** (`161f06ce`). Mac users see "Cmd+Enter"; others see "Ctrl+Enter". A small fix that removes a real frustration.
4. **Public submission feed** (`2c8dd039`). Guests can browse verdicts-only submission history — useful for seeing what's being solved on the platform without signing in.
5. **Privacy page** (`689cf61d`). Students can now see data retention windows and their rights. This is important for trust.
6. **Anti-cheat heartbeat enforcement** (`7eb128fc`). For exams, this means the platform actually validates that the browser monitor is running before accepting a submission. Students who play by the rules now get a fairer field.

## What's still frustrating

### F1. No educational scaffolding (HIGH)
The platform treats all users like competitive programmers. Missing:
- **Hints system**: No incremental hints per problem. A student stuck on a DP problem at 2 AM has nowhere to go.
- **Mistake explanation**: "Wrong Answer on test case 3" with no feedback on *why*. The `showDetailedResults` toggle exists but is instructor-controlled.
- **Progress tracking**: No "solved/attempted/unsolved over time" dashboard. No learning path or topic mastery visualization.
- **Walkthroughs/editorials**: The practice page has an "editorials" tab, but it's empty unless an instructor writes one. No auto-generated hints.

For a platform that claims to serve education, this is the biggest gap. Codeforces has editorial for every contest problem. BOJ has a discussion board. JudgeKit has neither at scale.

### F2. Mobile UX is still poor (HIGH)
- **Sticky code panel** on mobile prevents scrolling to the submission form.
- **Side-by-side diff** (`grid-cols-2`) is unreadable under 375px — no fallback to unified diff.
- **10-column problems table** on mobile is horizontal scrolling. The public submissions page has a mobile card view (`md:hidden`), but the problems list and contest detail pages don't.
- **Language selector** doesn't handle mobile virtual keyboards well.

### F3. Exam experience gaps (MEDIUM)
- **No "what happens if I Cmd-Tab?" guidance** before starting. Students don't know the consequences until they're already being monitored.
- **No recovery path** if the browser tab is accidentally closed during an exam. The draft survives in localStorage, but re-entering requires the password flow with no clear instructions.
- **No offline detection**. If network drops, the student sees generic error toasts. Their code is saved in localStorage drafts, but they don't know if their submission was sent.

### F4. Practice page and dashboard are disconnected (MEDIUM)
- `/practice/problems/[id]` is a rich experience (similar problems, editorials, keyboard shortcuts).
- `/dashboard/problems/[id]` is a simpler view.
- No link between them. A student who discovers the practice page by accident has no way to know the dashboard even exists, and vice versa.

### F5. Code editor is still bare-bones (MEDIUM)
- No autocomplete, linting, or code completion.
- No font size control in the UI (the prop exists but isn't exposed).
- No file type filter on upload — students could upload binaries.
- Line wrapping toggle exists as a prop but has no UI control.

### F6. Progress filter is O(n*m) on the client (LOW)
When a progress filter is active on the problems page, ALL accessible problem IDs and ALL user submissions are loaded into memory. With hundreds of problems and thousands of submissions, this is a performance problem. Should be a SQL query.

---

## Top 5 things that still work well

1. **Server-time-synced countdown** — `/api/v1/time` returns DB clock, not Node `Date.now()`. This is a real fairness feature that most OJs don't bother with.
2. **Draft persistence** — `useSourceDraft` (localStorage, 7-day TTL, debounced at 500ms) + `useUnsavedChangesGuard`. Your code survives accidents.
3. **Smart per-language templates** — Idiomatic starter code for 17 languages with template-replacement detection. A polish tier above BOJ.
4. **Detailed verdict feedback** — `failedTestCaseIndex`, `runtimeErrorType`, `executionTimeMs`, `memoryUsedKb`, `compileOutput` with instructor-controllable toggles.
5. **Similar-problems recommendation** — Automatic tag-intersection-based suggestions. BOJ doesn't have this. Codeforces' version is community-curated and stale.

---

## Summary

JudgeKit is a solid OJ for a student who already knows how to code. The submission flow, contest system, and judging are well-engineered. The gap is **educational scaffolding** — this platform does not yet teach. It evaluates. For a platform targeting student assignments and exams, the missing hints, walkthroughs, mistake explanations, and progress tracking are the most impactful gaps to close next.
