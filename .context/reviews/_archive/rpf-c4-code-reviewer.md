# Cycle 4 Code Review (RPF Session)

**Reviewer:** code-reviewer (focused verification)
**Date:** 2026-04-28
**Focus:** Verify cycles 1-3 fixes, find remaining/new issues in the change surface

---

## Cycle 1-3 Fix Verification

All 17 tasks from cycles 1-3 verified as correctly implemented:

| Cycle | Task | Description | Status |
|-------|------|-------------|--------|
| C1 | A | totalPoints reduce initial value | VERIFIED |
| C1 | B | examDurationMinutes in assignmentContext | VERIFIED |
| C1 | C | Redundant getExamSession fallback | VERIFIED |
| C1 | D | Dark mode badges on contest detail | VERIFIED |
| C1 | E | Layout upstream comment | VERIFIED |
| C2 | A | My Contests dark mode badges | VERIFIED |
| C2 | B | DEFAULT_PROBLEM_POINTS constant | VERIFIED — all 15+ locations |
| C2 | C | Import route type guard | VERIFIED |
| C2 | D | Regression tests | VERIFIED |
| C2 | E | assignmentId on Virtual Practice links | VERIFIED |
| C2 | F | locale passed to formatScore (enrolled contest) | VERIFIED |
| C2 | G | Shared getContestStatusBorderClass | VERIFIED |
| C2 | H | Parallelized queries | VERIFIED |
| C3 | A | Badge color shades standardized | VERIFIED |
| C3 | B | Shared formatDateLabel | VERIFIED |
| C3 | C | Dashboard DEFAULT_PROBLEM_POINTS | VERIFIED |
| C3 | D | Remove redundant getExamSession | VERIFIED |

---

## New Findings

### C4-CR-1: [MEDIUM] Dashboard contest badges missing dark mode variants

**File:** `src/app/(dashboard)/dashboard/contests/page.tsx:224,227`
**Also:** `src/app/(dashboard)/dashboard/contests/[assignmentId]/page.tsx:339,342`
**Confidence:** HIGH

Dashboard contest badges have no `dark:` variants:
- `contests/page.tsx:224`: `"bg-blue-500 text-white"` / `"bg-purple-500 text-white"`
- `contests/page.tsx:227`: `"bg-teal-500 text-white"` / `"bg-orange-500 text-white"`
- `contests/[assignmentId]/page.tsx:339`: `"bg-blue-500 text-white"` / `"bg-purple-500 text-white"`
- `contests/[assignmentId]/page.tsx:342`: `"bg-orange-500 text-white"` / `"bg-teal-500 text-white"`

Public pages were fixed in cycles 1-2 with `dark:bg-{color}-600 dark:text-white`. Dashboard is visible to instructors/admins who may use dark mode.

**Fix:** Add `dark:bg-{color}-600 dark:text-white` matching the public page convention.

---

### C4-CR-2: [MEDIUM] formatScore called without locale in public submissions page

**File:** `src/app/(public)/submissions/page.tsx:449,503`
**Confidence:** HIGH

Two `formatScore` calls missing locale:
- Line 449: `formatScore(sub.score)` — locale is available (used on line 452)
- Line 503: `formatScore(sub.score)` — locale available in same component

Other public pages correctly pass locale: `contests/[id]/page.tsx:393`, `practice/problems/[id]/page.tsx:680`.

**Fix:** Add `locale` as second argument to both `formatScore` calls.

---

### C4-CR-3: [LOW] formatScore called without locale in dashboard pages

**File:** `src/app/(dashboard)/dashboard/admin/submissions/page.tsx:474`
**Also:** `src/app/(dashboard)/dashboard/groups/[id]/analytics/page.tsx:118,156,165-167`
**Confidence:** MEDIUM

Six `formatScore` calls across two dashboard pages don't pass locale. The `locale` variable is available in both components. Consistency concern for admins using non-en-US locales.

**Fix:** Add `locale` as second argument.

---

### C4-CR-4: [LOW] Redundant getDbNow in contest detail page (carried from C2/C3)

**File:** `src/app/(public)/contests/[id]/page.tsx:132`
**Confidence:** HIGH

Carried from C2-AGG-9 / C3-AGG-5. `getEnrolledContestDetail` already calls `getDbNow()` internally. Still deferred per prior rationale.

---

## Summary

- **MEDIUM severity:** 2 (C4-CR-1, C4-CR-2)
- **LOW severity:** 2 (C4-CR-3, C4-CR-4)
- **Verified fixes:** 17/17 from cycles 1-3
