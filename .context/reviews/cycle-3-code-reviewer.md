# Cycle 3 Code Review — code-reviewer lane

**Date:** 2026-04-28
**Scope:** Verify cycle 1-2 fixes; find new issues in the change surface
**Reviewer:** code-reviewer

---

## Cycle 1-2 Fix Verification

### Task A: totalPoints reduce initial value — VERIFIED
`src/app/(public)/contests/[id]/page.tsx:184` — `sortedProblems.reduce((sum, p) => sum + p.points, 0)` correct. No off-by-100.

### Task B: examDurationMinutes in assignmentContext — VERIFIED
`src/app/(public)/practice/problems/[id]/page.tsx:158,184,207,481` — type, DB query, prop passing all correct.

### Task C: Redundant getExamSession fallback — VERIFIED (enrolled flow)
`src/app/(public)/contests/[id]/page.tsx:173` — uses `contest.examSession` directly.

### Task D: Dark mode badges on contest detail page — VERIFIED
`src/app/(public)/contests/[id]/page.tsx:233,236` — has `dark:bg-blue-600`, `dark:bg-purple-600`, `dark:bg-orange-600`, `dark:bg-teal-600`.

### Task E: Layout comment — VERIFIED
`src/app/(public)/contests/[id]/layout.tsx:17` — TODO note present.

### Cycle 2 Task A: My Contests dark mode badges — VERIFIED
`src/app/(public)/contests/page.tsx:177` — has `dark:bg-blue-600`/`dark:bg-purple-600`.

### Cycle 2 Task B: DEFAULT_PROBLEM_POINTS constant — PARTIALLY VERIFIED
`src/lib/assignments/constants.ts` — constant exists and is used in 4 public/lib files. However, 6+ dashboard files still use raw `?? 100`:
- `src/app/(dashboard)/dashboard/contests/[assignmentId]/page.tsx:166,246`
- `src/app/(dashboard)/dashboard/groups/[id]/page.tsx:326`
- `src/app/(dashboard)/dashboard/groups/[id]/assignments/[assignmentId]/page.tsx:120`
- `src/app/(dashboard)/dashboard/contests/[assignmentId]/students/[userId]/page.tsx:124`
- `src/app/(dashboard)/dashboard/groups/[id]/assignments/[assignmentId]/student/[userId]/page.tsx:177`
- `src/components/contest/participant-timeline-view.tsx:185,258`

### Cycle 2 Task C: Import route type guard — VERIFIED
`src/app/api/v1/admin/migrate/import/route.ts:162` — type guard added.

### Cycle 2 Task D: Regression tests — VERIFIED
`tests/component/assignment-overview.test.tsx` — 4 tests covering totalPoints, DEFAULT_PROBLEM_POINTS, exam duration, empty problems.

### Cycle 2 Task E: assignmentId on Virtual Practice links — VERIFIED
`src/app/(public)/contests/[id]/page.tsx:665` — includes `?assignmentId=${contest.id}`.

### Cycle 2 Task F: locale passed to formatScore — VERIFIED
`src/app/(public)/contests/[id]/page.tsx:396` — uses `formatScore(sub.score, locale)`.

### Cycle 2 Task G: Shared getContestStatusBorderClass — VERIFIED
`src/app/(public)/_components/contest-status-styles.ts` — shared utility with dark mode support.

### Cycle 2 Task H: Parallelized queries — VERIFIED
`src/app/(public)/contests/page.tsx:88-93` — uses `Promise.all`.

---

## New Findings

### C3-CR-1: [MEDIUM] Badge color inversion between My Contests and Catalog sections — light/dark shades swapped

**Confidence:** HIGH

The exam mode badge colors are inverted between the My Contests section and the PublicContestList component:

- **My Contests** (`contests/page.tsx:177`): `bg-blue-500` light / `dark:bg-blue-600` dark for scheduled, `bg-purple-500` / `dark:bg-purple-600` for windowed
- **Catalog** (`public-contest-list.tsx:93,136`): `bg-blue-600` light / `dark:bg-blue-500` dark for scheduled, `bg-purple-600` / `dark:bg-purple-500` for windowed
- **Contest Detail** (`contests/[id]/page.tsx:233`): `bg-blue-500` light / `dark:bg-blue-600` dark (matches My Contests, not Catalog)

The light/dark shade convention is inverted: My Contests uses lighter shades in light mode (500) and darker in dark mode (600), while Catalog does the opposite (600 light / 500 dark). Similarly the scoring model badges: contest detail uses `bg-orange-500`/`dark:bg-orange-600` while catalog uses `bg-orange-600`/`dark:bg-orange-500`.

This is a visual inconsistency that creates a jarring transition when scrolling between sections on the same page. Users see blue-500 badges in My Contests and blue-600 badges in the catalog below.

**Fix:** Standardize on one convention. The typical Tailwind dark mode pattern is `bg-{color}-500 dark:bg-{color}-600` (lighter in light mode, slightly darker in dark mode for contrast). Apply this consistently across all three files.

---

### C3-CR-2: [MEDIUM] Duplicate `formatDateLabel` function across two contest pages

**Confidence:** HIGH

`src/app/(public)/contests/page.tsx:21-24` and `src/app/(public)/contests/[id]/page.tsx:88-90` both define identical `formatDateLabel` functions. This is a DRY violation. If date formatting behavior needs to change, both must be updated.

**Fix:** Extract to a shared utility (e.g., alongside `contest-status-styles.ts` or in `src/lib/formatting.ts`).

---

### C3-CR-3: [LOW] Dashboard contest pages still use raw `?? 100` instead of DEFAULT_PROBLEM_POINTS

**Confidence:** HIGH

Cycle 2 Task B extracted the constant but only applied it to the files listed in the plan. Six+ dashboard files still hardcode `?? 100`:
- `src/app/(dashboard)/dashboard/contests/[assignmentId]/page.tsx:166,246`
- `src/app/(dashboard)/dashboard/groups/[id]/page.tsx:326`
- `src/app/(dashboard)/dashboard/groups/[id]/assignments/[assignmentId]/page.tsx:120`
- `src/app/(dashboard)/dashboard/contests/[assignmentId]/students/[userId]/page.tsx:124`
- `src/app/(dashboard)/dashboard/groups/[id]/assignments/[assignmentId]/student/[userId]/page.tsx:177`
- `src/components/contest/participant-timeline-view.tsx:185,258`

While these are dashboard (not public) files, the same data integrity concern applies: if the default ever changes, these would be missed.

**Fix:** Replace `?? 100` with `?? DEFAULT_PROBLEM_POINTS` in all dashboard files.

---

### C3-CR-4: [LOW] Redundant `getExamSession` call in problem detail page — data already available in assignmentContext

**Confidence:** MEDIUM

`src/app/(public)/practice/problems/[id]/page.tsx:441` calls `await getExamSession(assignmentContext.id, session.user.id)` for the windowed exam countdown, but `assignmentContext.personalDeadline` (computed at line 194) already contains this data from a prior `getExamSession` call at line 193.

The flow is:
1. Line 193: `const examSession = await getExamSession(...)` — computes `personalDeadline`
2. Line 194-195: `personalDeadline = examSession?.personalDeadline ?? null` — stored in `assignmentContext`
3. Line 441: `const session_ = await getExamSession(...)` — same query again for the countdown

This is the same class of issue as cycle 1 AGG-9 (redundant getExamSession).

**Fix:** Use `assignmentContext.personalDeadline` directly for the countdown timer instead of re-querying.

---

### C3-CR-5: [LOW] Contest detail enrolled view has redundant `getDbNow()` call (same as C2-AGG-9, not fixed)

**Confidence:** HIGH

`src/app/(public)/contests/[id]/page.tsx:135` calls `getDbNow()` after `getEnrolledContestDetail` at line 126, which internally also calls `getDbNow()` (line 316 of `public-contests.ts`). This was identified in cycle 2 as C2-AGG-9 and deferred. Confirming it still exists.

---

## Final Sweep

No files were skipped. All public-facing contest/practice pages reviewed. All cycle 1-2 modified files re-verified. Dashboard files checked for constant migration gaps. Badge color consistency checked across all three rendering locations.
