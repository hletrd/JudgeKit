# Cycle 5 Review Remediation Plan

**Date:** 2026-04-28
**Source:** `.context/reviews/_aggregate.md` (cycle 5)
**Status:** DONE

---

## Tasks

### Task A: [MEDIUM] Replace local `getStatusBorderClass` with shared `getContestStatusBorderClass` import

- **Source:** C5-AGG-1 (C5-CR-1)
- **Files:**
  - `src/app/(dashboard)/dashboard/contests/page.tsx:57-68` — local function without dark mode
  - `src/app/(dashboard)/dashboard/contests/page.tsx:181` — usage of local function
- **Fix:**
  1. Remove the local `getStatusBorderClass` function (lines 57-68)
  2. Import `getContestStatusBorderClass` from `@/app/(public)/_components/contest-status-styles`
  3. Update line 181 to use `getContestStatusBorderClass(status)` instead of `getStatusBorderClass(status)`
  4. Verify the `ContestStatus` type is compatible (it is — both use the same union)
- **Exit criteria:** Dashboard contests page uses the shared utility with dark mode support; no local duplicate
- [x] Done (commit 8dbb5999 — combined with Task C)

### Task B: [MEDIUM] Use `formatScore(sub.score, locale)` in 4 remaining raw score displays

- **Source:** C5-AGG-2 (C5-CR-2)
- **Files:**
  1. `src/app/(dashboard)/dashboard/contests/[assignmentId]/students/[userId]/page.tsx:186` — `{sub.score ?? 0}` → `{formatScore(sub.score, locale)}`
  2. `src/app/(dashboard)/dashboard/contests/[assignmentId]/participant/[userId]/submissions/page.tsx:173` — raw `sub.score` → `formatScore(sub.score, locale)`
  3. `src/app/(dashboard)/dashboard/groups/[id]/assignments/[assignmentId]/student/[userId]/page.tsx:225-226` — raw `sub.score` → `formatScore(sub.score, locale)`
  4. `src/components/contest/participant-timeline-view.tsx:340-341` — raw `sub.score` → `formatScore(sub.score, locale)`
- **Fix:**
  1. Add `import { formatScore } from "@/lib/formatting"` to files that don't have it
  2. Replace each raw score display with `formatScore(sub.score, locale)`
  3. Verify `locale` is available in scope (it is in all 4 files)
- **Exit criteria:** All score displays in dashboard views use locale-aware formatting
- [x] Done (commit 62f23355)

### Task C: [LOW] Remove misleading `as string | Date` cast in dashboard contests page

- **Source:** C5-AGG-3 (C5-CR-3)
- **File:** `src/app/(dashboard)/dashboard/contests/page.tsx:213`
- **Fix:** Change `contest.personalDeadline ?? contest.deadline as string | Date` to `contest.personalDeadline ?? contest.deadline!` (removed misleading cast, added non-null assertion since the enclosing truthiness check guarantees non-null)
- **Exit criteria:** No `as string | Date` cast; type-checker still passes
- [x] Done (commit 8dbb5999 — combined with Task A)

### Task D: [LOW] Pass `locale` prop to SubmissionStatusBadge in all callers

- **Source:** C5-AGG-4 (C5-CR-4)
- **Files:** All 14 external callers of `<SubmissionStatusBadge>` across the codebase
- **Fix:**
  1. Audit all `<SubmissionStatusBadge>` usages
  2. Add `locale={locale}` prop to each where `locale` is available in scope
  3. For client components where `locale` is from `useLocale()`, add `useLocale()` import and call
- **Exit criteria:** All SubmissionStatusBadge instances receive locale prop for tooltip number formatting
- [x] Done (commit 142d9ea5)

---

## Deferred Items

The following findings from the cycle 5 review are deferred this cycle with reasons:

| C5-AGG ID | Description | Severity | Reason for deferral | Exit criterion |
|-----------|-------------|----------|---------------------|----------------|
| (none) | | | | |

---

## Notes

- C5-AGG-1 (dashboard border class) is the same bug class as C2-AGG-8 which extracted the shared utility for public pages. The dashboard page was not migrated at the time.
- C5-AGG-2 (raw score display) is the same bug class as C2-AGG-7/C4-AGG-2/C4-AGG-3 (formatScore without locale) but for cases where `formatScore` is not used at all.
- C5-AGG-3 (type cast) was more nuanced than initially reported: removing the `as string | Date` cast revealed that `contest.deadline` is `Date | null`, requiring a non-null assertion `!` since TypeScript doesn't narrow through the `??` operator.
- C5-AGG-4 (SubmissionStatusBadge locale) is an extension of the locale-consistency work from cycles 2 and 4, but for the component's tooltip content.
