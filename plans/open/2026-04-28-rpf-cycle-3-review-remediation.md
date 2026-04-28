# Cycle 3 Review Remediation Plan

**Date:** 2026-04-28
**Source:** `.context/reviews/_aggregate.md` (cycle 3)
**Status:** DONE

---

## Tasks

### Task A: [MEDIUM] Standardize badge color shades across My Contests, Catalog, and Contest Detail

- **Source:** C3-AGG-1 (C3-CR-1)
- **Files:**
  - `src/app/(public)/_components/public-contest-list.tsx:93,96,136,139` — inverted shades (600 light / 500 dark)
  - `src/app/(public)/contests/page.tsx:177` — correct shades (500 light / 600 dark)
  - `src/app/(public)/contests/[id]/page.tsx:233,236` — correct shades (500 light / 600 dark)
- **Fix:**
  1. Standardize all badge colors to `bg-{color}-500 dark:bg-{color}-600` convention (standard Tailwind: lighter in light mode, slightly darker in dark mode)
  2. Update `public-contest-list.tsx` lines 93, 96, 136, 139 to use 500/600 instead of 600/500
  3. Verify contests/page.tsx:177 and contests/[id]/page.tsx:233,236 already use the correct convention
- **Exit criteria:** All three rendering locations use identical shade convention for exam mode and scoring model badges
- [x] Done (commit 8cb8418c)

### Task B: [MEDIUM] Extract shared `formatDateLabel` utility — DONE

- **Source:** C3-AGG-2 (C3-CR-2)
- **Files:**
  - `src/app/(public)/contests/page.tsx:21-24` — local definition
  - `src/app/(public)/contests/[id]/page.tsx:88-90` — local definition (identical)
- **Fix:**
  1. Add `formatDateLabel` to `src/app/(public)/_components/contest-status-styles.ts` (alongside existing `getContestStatusBorderClass`)
  2. Import and use in both contest pages
  3. Remove local function definitions from both pages
- **Exit criteria:** Single source of truth for `formatDateLabel`; no local duplicates
- [x] Done (commit 1ffef78e)

### Task C: [LOW] Replace remaining `?? 100` with `DEFAULT_PROBLEM_POINTS` in dashboard files

- **Source:** C3-AGG-3 (C3-CR-3)
- **Files:**
  1. `src/app/(dashboard)/dashboard/contests/[assignmentId]/page.tsx:166,246`
  2. `src/app/(dashboard)/dashboard/groups/[id]/page.tsx:326`
  3. `src/app/(dashboard)/dashboard/groups/[id]/assignments/[assignmentId]/page.tsx:120`
  4. `src/app/(dashboard)/dashboard/contests/[assignmentId]/students/[userId]/page.tsx:124`
  5. `src/app/(dashboard)/dashboard/groups/[id]/assignments/[assignmentId]/student/[userId]/page.tsx:177`
  6. `src/components/contest/participant-timeline-view.tsx:185,258`
- **Fix:** Replace `?? 100` with `?? DEFAULT_PROBLEM_POINTS` and add import from `@/lib/assignments/constants`
- **Exit criteria:** No remaining raw `?? 100` for problem points anywhere in the codebase
- [x] Done (commit bbbbb62a)

### Task D: [LOW] Remove redundant `getExamSession` call in problem detail page

- **Source:** C3-AGG-4 (C3-CR-4)
- **File:** `src/app/(public)/practice/problems/[id]/page.tsx:441`
- **Fix:**
  1. Replace the `getExamSession` call at line 441 with data already available in `assignmentContext`
  2. Use `assignmentContext.personalDeadline` for the countdown timer deadline
  3. The `startedAt` field needed for `examSession` can be derived from `assignmentContext.personalDeadline` and `assignmentContext.examDurationMinutes`, or we can keep the exam session in the assignment context
  4. Actually: the `examSession` variable on line 439 needs both `startedAt` and `personalDeadline`. `assignmentContext` has `personalDeadline` but not `startedAt`. So we need to either add `startedAt` to `assignmentContext` or keep the query. The cleaner approach: add `examStartedAt` to `assignmentContext` from the existing `getExamSession` call on line 193.
- **Exit criteria:** Only one `getExamSession` call in the problem detail page (line 193), used to populate `assignmentContext`; the second call (line 441) is eliminated
- [x] Done (commit d365a50c)

---

## Deferred Items

The following findings from the cycle 3 review are deferred this cycle with reasons:

| C3-AGG ID | Description | Severity | Reason for deferral | Exit criterion |
|-----------|-------------|----------|---------------------|----------------|
| C3-AGG-5 | `getDbNow` called redundantly in enrolled contest flow | LOW | Same as C2-AGG-9; requires changing `getEnrolledContestDetail` signature; minor optimization with risk of regression in a hot path | When `public-contests.ts` is refactored |

---

## Notes

- C3-AGG-1 (badge color inversion) was introduced by the cycle 2 dark mode fix — the `public-contest-list.tsx` component was updated with inverted shade conventions compared to the My Contests section.
- C3-AGG-3 (dashboard `?? 100`) is a continuation of cycle 2 Task B — the constant was only applied to public files, leaving dashboard files inconsistent.
- C3-AGG-4 (redundant getExamSession) is the same pattern as cycle 1 Task C but in a different file.
