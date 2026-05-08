# Code Review — Cycle 5

**Date:** 2026-04-28
**Reviewer:** code-reviewer (cycle 5 verification + new findings)
**Scope:** Verify cycle 1-4 fixes, find new issues

---

## Cycle 1-4 Fix Verification

All tasks from cycles 1-4 verified as correctly implemented:

| Cycle | Task | Description | Status |
|-------|------|-------------|--------|
| C1 | A | totalPoints reduce initial value | VERIFIED — line 181 uses `reduce(..., 0)` |
| C1 | B | examDurationMinutes in assignmentContext | VERIFIED — prop passed on line 281 |
| C1 | C | Redundant getExamSession fallback | VERIFIED — contest.examSession used directly on line 170 |
| C1 | D | Dark mode badges on contest detail | VERIFIED — lines 230, 233 have dark: variants |
| C1 | E | Layout upstream comment | VERIFIED |
| C2 | A | My Contests dark mode badges | VERIFIED — line 170 has dark: variants |
| C2 | B | DEFAULT_PROBLEM_POINTS constant | VERIFIED — all usages replaced, no raw `?? 100` found |
| C2 | C | Import route type guard | VERIFIED |
| C2 | D | Regression tests | VERIFIED |
| C2 | E | assignmentId on Virtual Practice links | VERIFIED — line 662 includes assignmentId |
| C2 | F | locale passed to formatScore | VERIFIED — line 393 |
| C2 | G | Shared getContestStatusBorderClass | VERIFIED — extracted to contest-status-styles.ts |
| C2 | H | Parallelized queries | VERIFIED — line 81 uses Promise.all |
| C3 | A | Badge color shades standardized | VERIFIED — all use 500/600 convention |
| C3 | B | Shared formatDateLabel utility | VERIFIED — extracted to contest-status-styles.ts |
| C3 | C | Dashboard `?? 100` replaced | VERIFIED — all use DEFAULT_PROBLEM_POINTS |
| C3 | D | Redundant getExamSession in problem detail | VERIFIED — lines 441-445 derive from assignmentContext |
| C4 | A | Dashboard dark mode badge variants | VERIFIED — lines 224, 227, 339, 342 have dark: variants |
| C4 | B | formatScore locale in public submissions | VERIFIED — lines 449, 503 |
| C4 | C | formatScore locale in dashboard pages | VERIFIED |

---

## New Findings (sorted by severity)

### C5-CR-1: [MEDIUM] Dashboard contests page uses local `getStatusBorderClass` without dark mode, diverging from shared utility

**File:** `src/app/(dashboard)/dashboard/contests/page.tsx:57-68`
**Confidence:** HIGH

The dashboard contests page defines its own `getStatusBorderClass` function (lines 57-68) that returns classes without dark mode variants (e.g., `border-l-blue-500` vs `dark:border-l-blue-400`). The public pages all use `getContestStatusBorderClass` from `contest-status-styles.ts` which includes dark mode.

**Fix:** Replace the local `getStatusBorderClass` with an import from `contest-status-styles.ts`, matching the pattern used by all other contest pages. The function signature is compatible (both accept `ContestStatus` keys).

---

### C5-CR-2: [MEDIUM] Score displays in 4 dashboard views use raw numbers instead of `formatScore(score, locale)`

**Files:**
1. `src/app/(dashboard)/dashboard/contests/[assignmentId]/students/[userId]/page.tsx:186` — `{sub.score ?? 0}`
2. `src/app/(dashboard)/dashboard/contests/[assignmentId]/participant/[userId]/submissions/page.tsx:173` — `{sub.score !== null && sub.score !== undefined ? sub.score : "-"}`
3. `src/app/(dashboard)/dashboard/groups/[id]/assignments/[assignmentId]/student/[userId]/page.tsx:225-226` — `{sub.score !== null ... ? sub.score : "-"}`
4. `src/components/contest/participant-timeline-view.tsx:340-341` — `{sub.score !== null ... ? sub.score : "-"}`

**Confidence:** HIGH

All four locations display submission scores as raw JavaScript numbers (e.g., `87.5` or `123456`) without locale-aware formatting. Other locations in the same files use `formatScore(sub.score, locale)`. The `locale` variable is available in all four files. This causes inconsistent number display (no thousands separators, no locale digit grouping) compared to the rest of the app.

**Fix:** Replace each raw `sub.score` display with `formatScore(sub.score, locale)`. Add `import { formatScore } from "@/lib/formatting"` where missing.

---

### C5-CR-3: [LOW] Misleading type cast `as string | Date` in dashboard contests page

**File:** `src/app/(dashboard)/dashboard/contests/page.tsx:213`
**Confidence:** HIGH

```tsx
deadline={new Date(contest.personalDeadline ?? contest.deadline as string | Date).getTime()}
```

The `as string | Date` cast only applies to `contest.deadline` due to operator precedence (`??` binds looser than `as`). Both `personalDeadline` and `deadline` are already `Date | null` from `getContestsForUser`, so the cast is both misleading and unnecessary. The `new Date()` call works correctly with `Date | null` inputs (when guarded by the `??`), but the cast creates a false impression that these fields might be strings.

**Fix:** Remove the `as string | Date` cast entirely. The expression simplifies to:
```tsx
deadline={new Date(contest.personalDeadline ?? contest.deadline).getTime()}
```

---

### C5-CR-4: [LOW] SubmissionStatusBadge locale prop not passed by any caller except the component itself

**Files:** All ~18 usages of `<SubmissionStatusBadge>` across the codebase
**Confidence:** MEDIUM

The `SubmissionStatusBadge` component accepts an optional `locale` prop (defaulting to `"en-US"`) for `formatScore` and `formatNumber` in its tooltip content. However, only the component's internal self-reference passes `locale`. None of the ~18 external callers pass the `locale` prop, causing tooltip number formatting to always use `"en-US"` regardless of the user's locale setting.

Additionally, the component contains hardcoded English strings that are not i18n'd:
- Line 86: `"WA on test #"` — always shows English "WA on test #N"
- Line 89: `"Score: "` — always shows English "Score: "
- Line 98: `"Runtime error"` — always shows English "Runtime error"

These are part of the previously deferred DEFER-34/DEFER-35 items but the `locale` prop gap is new and actionable.

**Fix:** For the `locale` prop: pass `locale` from each caller's existing `locale` variable. For the hardcoded strings: these are already tracked as DEFER-34/DEFER-35, but the `locale` prop gap should be addressed now since it's a simple prop pass-through.

---

## Carried Deferred Items (unchanged)

All deferred items from cycles 1-4 remain accurately deferred and unchanged. No regressions introduced.
