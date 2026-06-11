# Code Reviewer — Cycle 6 (RPF)

**Date:** 2026-04-28
**Reviewer:** code-reviewer (focused verification + new findings)
**Scope:** Verification of cycle 1-5 fixes; full repo sweep for remaining issues

---

## Cycle 1-5 Fix Verification

All 22 tasks from cycles 1-5 verified:

| Cycle | Task | Description | Status |
|-------|------|-------------|--------|
| C1 | A | totalPoints reduce initial value | VERIFIED |
| C1 | B | examDurationMinutes in assignmentContext | VERIFIED |
| C1 | C | Redundant getExamSession fallback | VERIFIED |
| C1 | D | Dark mode badges on contest detail | VERIFIED |
| C1 | E | Layout upstream comment | VERIFIED |
| C2 | A | My Contests dark mode badges | VERIFIED |
| C2 | B | DEFAULT_PROBLEM_POINTS constant | VERIFIED — no remaining raw `?? 100` |
| C2 | C | Import route type guard | VERIFIED |
| C2 | D | Regression tests | VERIFIED |
| C2 | E | assignmentId on Virtual Practice links | VERIFIED |
| C2 | F | locale passed to formatScore | VERIFIED |
| C2 | G | Shared getContestStatusBorderClass | VERIFIED |
| C2 | H | Parallelized queries | VERIFIED |
| C3 | A | Badge color shades standardized | VERIFIED |
| C3 | B | Shared formatDateLabel utility | VERIFIED |
| C3 | C | Dashboard `?? 100` replaced | VERIFIED |
| C3 | D | Redundant getExamSession in problem detail | VERIFIED |
| C4 | A | Dashboard dark mode badge variants | VERIFIED |
| C4 | B | formatScore locale in public submissions | VERIFIED |
| C4 | C | formatScore locale in dashboard pages | VERIFIED |
| C5 | A | Dashboard contests page uses shared getContestStatusBorderClass | VERIFIED |
| C5 | B | formatScore in 4 dashboard views | VERIFIED |
| C5 | C | Removed misleading `as string | Date` cast | VERIFIED |
| C5 | D | SubmissionStatusBadge locale prop passed by all callers | VERIFIED — all 14+ callers now pass locale |

All cycle 1-5 fixes are correctly implemented. No regressions found.

---

## New Findings

### C6-CR-1: [MEDIUM] Duplicate `getStatusBadgeVariant` function in two contests pages

**File:** `src/app/(dashboard)/dashboard/contests/page.tsx:35-48`
**File:** `src/app/(public)/contests/page.tsx:20-33`
**Confidence:** HIGH

Both files define an identical `getStatusBadgeVariant(status: ContestStatus)` function. This is the same duplication pattern as C2-AGG-8/C5-AGG-1 where `getStatusBorderClass` was duplicated and had to be extracted. The function should be moved to `contest-status-styles.ts` alongside `getContestStatusBorderClass` and `formatDateLabel`.

**Failure scenario:** If a new status is added or a variant mapping changes, only one copy may get updated, causing visual inconsistency between dashboard and public pages.

**Fix:** Extract `getStatusBadgeVariant` to `src/app/(public)/_components/contest-status-styles.ts` and import from both pages.

---

### C6-CR-2: [MEDIUM] Missing scoring model badge in public contests page "My Contests" section

**File:** `src/app/(public)/contests/page.tsx:166-173`
**Confidence:** HIGH

The "My Contests" section on the public contests page shows the status badge and exam mode badge, but is missing the scoring model badge (IOI/ICPC). Both the dashboard contests page (`src/app/(dashboard)/dashboard/contests/page.tsx:213-216`) and the public contest list component (`src/app/(public)/_components/public-contest-list.tsx:96,139`) show both badges. Users viewing the "My Contests" section will not see scoring model information.

**Failure scenario:** A user enrolled in both IOI and ICPC contests cannot tell them apart from the "My Contests" cards without clicking into each one.

**Fix:** Add the scoring model badge after the exam mode badge in the "My Contests" section, using the same pattern as the dashboard page:
```tsx
<Badge className={`text-xs ${contest.scoringModel === "ioi" ? "bg-teal-500 text-white dark:bg-teal-600 dark:text-white" : "bg-orange-500 text-white dark:bg-orange-600 dark:text-white"}`}>
  {contest.scoringModel === "ioi" ? tContests("scoringModelIoi") : tContests("scoringModelIcpc")}
</Badge>
```

---

### C6-CR-3: [LOW] Inconsistent `dark:text-white` in public contest badges

**Files:**
- `src/app/(public)/contests/page.tsx:170` — exam mode badge missing `dark:text-white`
- `src/app/(public)/_components/public-contest-list.tsx:93,96,136,139` — 4 badges missing `dark:text-white`

**Confidence:** MEDIUM

The public contests page and public contest list have colored badges with `text-white` but without `dark:text-white`. All equivalent badges in the dashboard contests page (`src/app/(dashboard)/dashboard/contests/page.tsx:212,215`) and contest detail page (`src/app/(public)/contests/[id]/page.tsx:230,233`) include `dark:text-white`. While `text-white` alone likely applies in both modes due to Tailwind's CSS specificity, the inconsistency is a maintenance risk — if the Badge component's base variant styles change, these pages may render differently.

**Fix:** Add `dark:text-white` to all 5 badge instances for consistency with the rest of the codebase.

---

## Gate Status

- **eslint:** PASS (0 errors, 0 warnings)
- **tsc --noEmit:** PASS (0 errors)
