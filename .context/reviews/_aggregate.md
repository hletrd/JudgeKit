# Aggregate Review — Cycle 3

**Date:** 2026-04-28
**Reviewers:** code-reviewer (1 lane — focused verification + new findings)
**Total findings:** 0 HIGH, 2 MEDIUM, 3 LOW (deduplicated, new findings only)

---

## Cycle 1-2 Fix Verification Summary

All 13 tasks from cycles 1-2 were verified:

| Cycle | Task | Description | Status |
|-------|------|-------------|--------|
| C1 | A | totalPoints reduce initial value | VERIFIED |
| C1 | B | examDurationMinutes in assignmentContext | VERIFIED |
| C1 | C | Redundant getExamSession fallback | VERIFIED |
| C1 | D | Dark mode badges on contest detail | VERIFIED |
| C1 | E | Layout upstream comment | VERIFIED |
| C2 | A | My Contests dark mode badges | VERIFIED |
| C2 | B | DEFAULT_PROBLEM_POINTS constant | PARTIALLY VERIFIED — public files done, dashboard files still raw `?? 100` |
| C2 | C | Import route type guard | VERIFIED |
| C2 | D | Regression tests | VERIFIED |
| C2 | E | assignmentId on Virtual Practice links | VERIFIED |
| C2 | F | locale passed to formatScore | VERIFIED |
| C2 | G | Shared getContestStatusBorderClass | VERIFIED |
| C2 | H | Parallelized queries | VERIFIED |

**Notable gap:** C2 Task B (DEFAULT_PROBLEM_POINTS) was only applied to 4 public-facing files. Six+ dashboard/component files still use raw `?? 100`.

---

## Deduplicated Findings (sorted by severity)

### C3-AGG-1: [MEDIUM] Badge color shade inversion between My Contests and Catalog sections

**Sources:** C3-CR-1 | **Confidence:** HIGH

The light/dark shade convention for exam mode and scoring model badges is inverted between the three rendering locations:

- **My Contests** (`contests/page.tsx:177`): `bg-blue-500` / `dark:bg-blue-600` (light=500, dark=600)
- **Catalog** (`public-contest-list.tsx:93,136`): `bg-blue-600` / `dark:bg-blue-500` (light=600, dark=500) — **INVERTED**
- **Contest Detail** (`contests/[id]/page.tsx:233,236`): `bg-blue-500` / `dark:bg-blue-600` (light=500, dark=600) — matches My Contests

Same pattern for purple (windowed), orange (ICPC), and teal (IOI) badges. The inversion creates a visible discontinuity when scrolling between My Contests and Catalog on the same page.

**Fix:** Standardize all locations on `bg-{color}-500 dark:bg-{color}-600` (standard Tailwind convention: lighter in light mode, slightly darker in dark mode). Update `public-contest-list.tsx` lines 93, 96, 136, 139.

---

### C3-AGG-2: [MEDIUM] Duplicate `formatDateLabel` function across two contest pages

**Sources:** C3-CR-2 | **Confidence:** HIGH

`src/app/(public)/contests/page.tsx:21-24` and `src/app/(public)/contests/[id]/page.tsx:88-90` define identical `formatDateLabel` functions. DRY violation — if date formatting logic changes, both must be updated independently.

**Fix:** Extract to `src/app/(public)/_components/contest-status-styles.ts` (rename to `contest-utils.ts` to reflect broader scope) or to `src/lib/formatting.ts`. Import in both pages.

---

### C3-AGG-3: [LOW] Dashboard files still use raw `?? 100` instead of DEFAULT_PROBLEM_POINTS

**Sources:** C3-CR-3 | **Confidence:** HIGH

The constant `DEFAULT_PROBLEM_POINTS` was introduced in cycle 2 but only applied to public-facing files. These dashboard/component files still hardcode `?? 100`:

1. `src/app/(dashboard)/dashboard/contests/[assignmentId]/page.tsx:166,246`
2. `src/app/(dashboard)/dashboard/groups/[id]/page.tsx:326`
3. `src/app/(dashboard)/dashboard/groups/[id]/assignments/[assignmentId]/page.tsx:120`
4. `src/app/(dashboard)/dashboard/contests/[assignmentId]/students/[userId]/page.tsx:124`
5. `src/app/(dashboard)/dashboard/groups/[id]/assignments/[assignmentId]/student/[userId]/page.tsx:177`
6. `src/components/contest/participant-timeline-view.tsx:185,258`

**Fix:** Replace `?? 100` with `?? DEFAULT_PROBLEM_POINTS` and add the import.

---

### C3-AGG-4: [LOW] Redundant `getExamSession` call in problem detail page

**Sources:** C3-CR-4 | **Confidence:** MEDIUM

`src/app/(public)/practice/problems/[id]/page.tsx:441` calls `await getExamSession(assignmentContext.id, session.user.id)` for the exam countdown, but `assignmentContext.personalDeadline` (line 195) already contains the result of the same query from line 193. This is the same pattern fixed in cycle 1 (AGG-9/Task C) for the contest detail page, but it persists here.

**Fix:** Use `assignmentContext.personalDeadline` directly for the countdown timer, eliminating the redundant DB query.

---

### C3-AGG-5: [LOW] Redundant `getDbNow()` call in enrolled contest detail flow (carried from C2-AGG-9)

**Sources:** C3-CR-5, C2-AGG-9 | **Confidence:** HIGH

`src/app/(public)/contests/[id]/page.tsx:135` calls `getDbNow()` after `getEnrolledContestDetail` (line 126), which already calls `getDbNow()` internally (`public-contests.ts:316`). This was deferred in cycle 2. Confirming still present.

---

## Carried Deferred Items (unchanged from cycle 2)

- DEFER-22: `.json()` before `response.ok` — 60+ instances
- DEFER-23: Raw API error strings without translation — partially fixed
- DEFER-24: `migrate/import` unsafe casts — partially addressed by C2-AGG-4
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
- C2-AGG-9 (now C3-AGG-5): `getDbNow` called redundantly — LOW, deferred
- C2-AGG-10: CountdownTimer namespace mismatch — LOW, deferred
- C2-AGG-11: Problem detail page redundant `getExamSession` — LOW, deferred (now C3-AGG-4, plan to fix this cycle)

---

## No Agent Failures

The review lane completed successfully.

---

## Plannable Tasks for This Cycle

1. **C3-AGG-1** (MEDIUM) — Standardize badge color shades across My Contests, Catalog, and Contest Detail
2. **C3-AGG-2** (MEDIUM) — Extract shared `formatDateLabel` utility
3. **C3-AGG-3** (LOW) — Replace remaining `?? 100` with `DEFAULT_PROBLEM_POINTS` in dashboard files
4. **C3-AGG-4** (LOW) — Remove redundant `getExamSession` call in problem detail page
