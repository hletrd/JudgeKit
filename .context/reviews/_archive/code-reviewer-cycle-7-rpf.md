# Code Review — Cycle 7 RPF

**Date:** 2026-04-28
**Reviewer:** code-reviewer
**Scope:** Full repo with focus on cycle 1-6 fix verification and new issues

---

## Cycle 1-6 Fix Verification

All 26 tasks from cycles 1-6 verified as correctly implemented:

| Cycle | Task | Description | Status |
|-------|------|-------------|--------|
| C1 | A | totalPoints reduce initial value | VERIFIED |
| C1 | B | examDurationMinutes in assignmentContext | VERIFIED |
| C1 | C | Redundant getExamSession fallback | VERIFIED |
| C1 | D | Dark mode badges on contest detail | VERIFIED |
| C1 | E | Layout upstream comment | VERIFIED |
| C2 | A | My Contests dark mode badges | VERIFIED |
| C2 | B | DEFAULT_PROBLEM_POINTS constant | VERIFIED — no remaining raw `?? 100` in UI code |
| C2 | C | Import route type guard | VERIFIED |
| C2 | D | Regression tests | VERIFIED |
| C2 | E | assignmentId on Virtual Practice links | VERIFIED |
| C2 | F | locale passed to formatScore | VERIFIED — all call sites pass locale |
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
| C5 | D | SubmissionStatusBadge locale prop passed by all callers | VERIFIED — all 19 call sites pass locale |
| C6 | A | Extract getStatusBadgeVariant to shared utility | VERIFIED — no duplicate definitions remain |
| C6 | B | Scoring model badge in My Contests | VERIFIED |
| C6 | C | dark:text-white on 5 public contest badges | VERIFIED — all colored badges include dark:text-white |

No regressions found in any cycle 1-6 fix.

---

## New Findings

### C7-CR-1: [MEDIUM] formatDifficulty missing locale in dashboard problems page

**File:** `src/app/(dashboard)/dashboard/problems/page.tsx:649`
**Confidence:** HIGH

```tsx
{problem.difficulty != null ? t("difficultyValue", { value: formatDifficulty(problem.difficulty) }) : <span className="text-muted-foreground">-</span>}
```

`formatDifficulty` accepts a `locale` parameter (defaults to `"en-US"`) but it is not passed here. The `locale` variable IS available in this component (line 131: `const locale = await getLocale()`). Every other `formatDifficulty` call site in the codebase passes `locale`:

- `src/app/(public)/users/[id]/page.tsx:300` — passes `locale`
- `src/app/(public)/practice/page.tsx:706` — passes `locale`
- `src/app/(public)/practice/problems/[id]/page.tsx:525,604` — passes `locale`
- `src/app/(public)/contests/[id]/page.tsx:574` — passes `locale`

This is the same bug class as C4-B/C (formatScore missing locale), which was fixed in cycles 4-5. The fix is trivial: change to `formatDifficulty(problem.difficulty, locale)`.

**Fix:** Pass `locale` as the second argument to `formatDifficulty`.

---

### C7-CR-2: [MEDIUM] Missing contest status badge in enrolled contest detail view

**File:** `src/app/(public)/contests/[id]/page.tsx:229-236`
**Confidence:** HIGH

The enrolled contest view (lines 228-237) shows exam mode and scoring model badges but omits the contest status badge entirely:

```tsx
<div className="flex flex-wrap items-center gap-1.5 mb-2">
  <Badge className={...exam mode...}>
  <Badge className={...scoring model...}>
  <Badge variant="outline">{tContest("group")}: {contest.groupName}</Badge>
</div>
```

Every other contest view shows a status badge:
- Dashboard contests page (`contests/page.tsx:194`) — `<Badge variant={getContestStatusBadgeVariant(status)}>`
- Public contests My Contests section (`contests/page.tsx:152`) — `<Badge variant={getContestStatusBadgeVariant(contest.status)}>`
- PublicContestDetail component (`public-contest-detail.tsx:109`) — `<Badge variant="outline">{statusLabel}</Badge>`

The enrolled view has `contest.status` available (it's part of `EnrolledContestDetail` type) and `statusLabels` is defined at line 107-113. The fix is to add a status badge before the exam mode badge.

**Fix:** Add a `<Badge variant={getContestStatusBadgeVariant(contest.status)} className="text-xs">{statusLabels[contest.status]}</Badge>` before the exam mode badge, importing `getContestStatusBadgeVariant` from `contest-status-styles.ts`.

---

### C7-CR-3: [LOW] Enrolled contest view uses inline badge styles instead of shared utility

**File:** `src/app/(public)/contests/[id]/page.tsx:230-234`
**Confidence:** MEDIUM

The enrolled contest view uses inline conditional class strings for exam mode and scoring model badges:

```tsx
<Badge className={contest.examMode === "scheduled" ? "bg-blue-500 text-white dark:bg-blue-600 dark:text-white" : "bg-purple-500 text-white dark:bg-purple-600 dark:text-white"}>
```

The same badge class patterns are used in 4 other files (dashboard contests page, public contests page, public contest list, public contest detail). This is the same duplication pattern that was fixed for `getContestStatusBorderClass` (C2-AGG-8/C5-AGG-1) and `getStatusBadgeVariant` (C6-AGG-1). If a color changes, all 5+ instances must be updated in lockstep.

**Fix:** Extract `getExamModeBadgeClass` and `getScoringModelBadgeClass` (or a single `getContestBadgeClass`) to `contest-status-styles.ts` alongside the existing shared utilities.

---

## Deferred Items Carried Forward

The following deferred items from previous cycles remain unchanged:

- DEFER-22: `.json()` before `response.ok` — 60+ instances
- DEFER-23: Raw API error strings without translation
- DEFER-24: `migrate/import` unsafe casts
- DEFER-27: Missing AbortController on polling fetches
- DEFER-28: `as { error?: string }` pattern — 22+ instances
- DEFER-29: Admin routes bypass `createApiHandler`
- DEFER-30: Recruiting validate token brute-force
- DEFER-32: Admin settings exposes DB host/port
- DEFER-33: Missing error boundaries
- DEFER-34: Hardcoded English fallback strings
- DEFER-35: Hardcoded English strings in editor title attributes
- DEFER-36: `formData.get()` cast assertions
- DEFER-43: Docker client leaks `err.message` in build responses
- DEFER-44: No documentation for timer pattern convention
- C2-AGG-9/C3-AGG-5/C4-AGG-4: `getDbNow` called redundantly
- C2-AGG-10: CountdownTimer namespace mismatch
