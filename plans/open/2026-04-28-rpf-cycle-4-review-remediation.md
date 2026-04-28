# Cycle 4 Review Remediation Plan

**Date:** 2026-04-28
**Source:** `.context/reviews/_aggregate.md` (cycle 4, RPF session)
**Status:** DONE

---

## Tasks

### Task A: [MEDIUM] Add dark mode badge variants to dashboard contest pages

- **Source:** C4-AGG-1 (C4-CR-1)
- **Files:**
  - `src/app/(dashboard)/dashboard/contests/page.tsx:224,227` — badges without dark mode
  - `src/app/(dashboard)/dashboard/contests/[assignmentId]/page.tsx:339,342` — badges without dark mode
- **Fix:**
  1. In `contests/page.tsx:224`, change `"bg-blue-500 text-white"` to `"bg-blue-500 text-white dark:bg-blue-600 dark:text-white"` and `"bg-purple-500 text-white"` to `"bg-purple-500 text-white dark:bg-purple-600 dark:text-white"`
  2. In `contests/page.tsx:227`, change `"bg-teal-500 text-white"` to `"bg-teal-500 text-white dark:bg-teal-600 dark:text-white"` and `"bg-orange-500 text-white"` to `"bg-orange-500 text-white dark:bg-orange-600 dark:text-white"`
  3. In `contests/[assignmentId]/page.tsx:339`, change `"bg-blue-500 text-white"` to `"bg-blue-500 text-white dark:bg-blue-600 dark:text-white"` and `"bg-purple-500 text-white"` to `"bg-purple-500 text-white dark:bg-purple-600 dark:text-white"`
  4. In `contests/[assignmentId]/page.tsx:342`, change `"bg-orange-500 text-white"` to `"bg-orange-500 text-white dark:bg-orange-600 dark:text-white"` and `"bg-teal-500 text-white"` to `"bg-teal-500 text-white dark:bg-teal-600 dark:text-white"`
- **Exit criteria:** All dashboard contest badges have dark mode variants matching the public page convention
- [x] Done (commit ede68019)

### Task B: [MEDIUM] Pass locale to formatScore in public submissions page

- **Source:** C4-AGG-2 (C4-CR-2)
- **Files:**
  - `src/app/(public)/submissions/page.tsx:449` — `formatScore(sub.score)` missing locale
  - `src/app/(public)/submissions/page.tsx:503` — `formatScore(sub.score)` missing locale
- **Fix:**
  1. Change `formatScore(sub.score)` to `formatScore(sub.score, locale)` on line 449
  2. Change `formatScore(sub.score)` to `formatScore(sub.score, locale)` on line 503
  3. Verify `locale` variable is in scope (it is — used in the same function for `formatDateTimeInTimeZone`)
- **Exit criteria:** All `formatScore` calls in public pages pass locale
- [x] Done (commit 3bd0dab7)

### Task C: [LOW] Pass locale to formatScore in dashboard pages

- **Source:** C4-AGG-3 (C4-CR-3)
- **Files:**
  - `src/app/(dashboard)/dashboard/admin/submissions/page.tsx:474`
  - `src/app/(dashboard)/dashboard/groups/[id]/analytics/page.tsx:118,156,165,166,167`
- **Fix:**
  1. In `admin/submissions/page.tsx:474`, change `formatScore(sub.score)` to `formatScore(sub.score, locale)`
  2. In `analytics/page.tsx:118,156,165,166,167`, add `locale` as second argument to all `formatScore` calls
  3. Verify `locale` variable is available in both components
- **Exit criteria:** All `formatScore` calls pass locale consistently
- [x] Done (commit ebde347c)

---

## Deferred Items

The following findings from the cycle 4 review are deferred this cycle with reasons:

| C4-AGG ID | Description | Severity | Reason for deferral | Exit criterion |
|-----------|-------------|----------|---------------------|----------------|
| C4-AGG-4 | `getDbNow` called redundantly in enrolled contest flow | LOW | Same as C2-AGG-9/C3-AGG-5; requires changing `getEnrolledContestDetail` signature; minor optimization with risk of regression in a hot path | When `public-contests.ts` is refactored |

---

## Notes

- C4-AGG-1 (dashboard dark mode badges) is the same pattern as C2-AGG-1 (My Contests dark mode badges) — the cycle 2 fix only addressed the public-facing contests page, not the dashboard pages.
- C4-AGG-2 (formatScore without locale in public submissions) is the same bug class as C2-AGG-7 (formatScore without locale in enrolled contest view, fixed in C2 Task F).
- C4-AGG-3 extends the locale-consistency fix to dashboard pages.
