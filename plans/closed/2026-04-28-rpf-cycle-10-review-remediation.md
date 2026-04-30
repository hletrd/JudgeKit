# Cycle 10 Review Remediation Plan

**Date:** 2026-04-28
**Source:** `.context/reviews/_aggregate.md` (cycle 10)
**Status:** DONE

---

## Tasks

### Task A: [MEDIUM] Pass locale to `formatNumber` in sidebar panel

- **Source:** C10-AGG-1 (C10-CR-1)
- **Files:**
  - `src/components/layout/active-timed-assignment-sidebar-panel.tsx:179` — `formatNumber(progressPercent, { maximumFractionDigits: 1 })` missing `locale`
- **Fix:**
  1. Change `formatNumber(progressPercent, { maximumFractionDigits: 1 })` to `formatNumber(progressPercent, { locale, maximumFractionDigits: 1 })` (locale is already available via `useLocale()` on line 47)
- **Exit criteria:** `formatNumber` call passes locale parameter
- [x] Done

### Task B: [MEDIUM] Add dark mode variant to sidebar panel progress bar

- **Source:** C10-AGG-2 (C10-CR-2)
- **Files:**
  - `src/components/layout/active-timed-assignment-sidebar-panel.tsx:185` — `bg-red-500` missing dark variant
- **Fix:**
  1. Change `isUrgent ? "bg-red-500" : "bg-sidebar-primary"` to `isUrgent ? "bg-red-500 dark:bg-red-600" : "bg-sidebar-primary"`
- **Exit criteria:** Urgent progress bar has dark mode variant
- [x] Done

### Task C: [LOW] Add dark mode variants to submission overview icon colors

- **Source:** C10-AGG-3 (C10-CR-3)
- **Files:**
  - `src/components/lecture/submission-overview.tsx:177` — `text-red-500` missing dark variant
  - `src/components/lecture/submission-overview.tsx:181` — `text-orange-500` missing dark variant
  - `src/components/lecture/submission-overview.tsx:185` — `text-yellow-500` missing dark variant
  - `src/components/lecture/submission-overview.tsx:190` — `text-blue-500` missing dark variant
- **Fix:**
  1. Change `text-red-500` to `text-red-500 dark:text-red-400` (line 177)
  2. Change `text-orange-500` to `text-orange-500 dark:text-orange-400` (line 181)
  3. Change `text-yellow-500` to `text-yellow-500 dark:text-yellow-400` (line 185)
  4. Change `text-blue-500` to `text-blue-500 dark:text-blue-400` (line 190)
- **Exit criteria:** All icon color classes have dark mode variants for improved contrast
- [x] Done

### Task D: [LOW] Add dark mode variant to anti-cheat dashboard user icon

- **Source:** C10-AGG-4 (C10-CR-4)
- **Files:**
  - `src/components/contest/anti-cheat-dashboard.tsx:399` — `text-orange-500` missing dark variant
- **Fix:**
  1. Change `text-orange-500` to `text-orange-500 dark:text-orange-400`
- **Exit criteria:** User icon has dark mode text variant
- [x] Done

### Task E: [LOW] Add dark mode variant to leaderboard trophy icon

- **Source:** C10-AGG-5 (C10-CR-5)
- **Files:**
  - `src/components/contest/leaderboard-table.tsx:84` — `text-yellow-500` missing dark variant
- **Fix:**
  1. Change `text-yellow-500` to `text-yellow-500 dark:text-yellow-400`
- **Exit criteria:** Rank 1 trophy icon has dark mode variant
- [x] Done

### Task F: [LOW] Add dark mode variants to language config table status badges

- **Source:** C10-AGG-6 (C10-CR-6)
- **Files:**
  - `src/app/(dashboard)/dashboard/admin/languages/language-config-table.tsx:328` — `text-green-600` missing dark variant
  - `src/app/(dashboard)/dashboard/admin/languages/language-config-table.tsx:424` — `text-yellow-600 border-yellow-300` missing dark variants
  - `src/app/(dashboard)/dashboard/admin/languages/language-config-table.tsx:429` — `text-yellow-600 border-yellow-300` missing dark variants
  - `src/app/(dashboard)/dashboard/admin/languages/language-config-table.tsx:430` — `text-green-600 border-green-300` missing dark variants
- **Fix:**
  1. Line 328: Change `text-green-600` to `text-green-600 dark:text-green-400`
  2. Line 424: Add `dark:text-yellow-400 dark:border-yellow-700` to badge class
  3. Line 429: Add `dark:text-yellow-400 dark:border-yellow-700` to badge class
  4. Line 430: Add `dark:text-green-400 dark:border-green-700` to badge class
- **Exit criteria:** Status badge text and border colors have dark mode variants
- [x] Done

### Task G: [LOW] Add dark mode variant to file upload dialog success text

- **Source:** C10-AGG-7 (C10-CR-7)
- **Files:**
  - `src/app/(dashboard)/dashboard/admin/files/file-upload-dialog.tsx:189` — `text-green-600` missing dark variant
- **Fix:**
  1. Change `text-green-600` to `text-green-600 dark:text-green-400`
- **Exit criteria:** Success text has dark mode variant
- [x] Done

### Task H: [LOW] Add dark mode variant to contest join success text

- **Source:** C10-AGG-8 (C10-CR-8)
- **Files:**
  - `src/app/(public)/contests/join/contest-join-client.tsx:92` — `text-green-600` missing dark variant
- **Fix:**
  1. Change `text-green-600` to `text-green-600 dark:text-green-400`
- **Exit criteria:** Success text has dark mode variant
- [x] Done

### Task I: Housekeeping — Mark C9 Task E as done in plan document

- **Source:** Review observation (plan vs code mismatch)
- **Files:**
  - `plans/open/2026-04-28-rpf-cycle-9-review-remediation.md` — Task E marked `[ ]` but fix is applied
- **Fix:**
  1. Update C9 Task E checkbox from `[ ]` to `[x]`
- **Exit criteria:** C9 plan document matches codebase state
- [x] Done

---

## Deferred Items

The following findings from the cycle 10 review are deferred this cycle with reasons:

| C10-AGG ID | Description | Severity | Reason for deferral | Exit criterion |
|-----------|-------------|----------|---------------------|----------------|
| (none) | | | | |

All findings are scheduled for implementation this cycle.

---

## Notes

- 6 of 8 findings (Tasks C-H) are the same dark mode consistency bug class found in cycles 8-9, but in files not previously reviewed. The pattern is: `text-{color}-500/600` or `bg-{color}-500` without `dark:` variants. These are progressively being caught as the review expands to more files.
- Task A (formatNumber missing locale) is the same locale-parameter bug class from C8-AGG-1/C8-AGG-2. Despite the locale parameter having a default, it should always be passed when available from `useLocale()`.
- Tasks A and B both affect the same file (`active-timed-assignment-sidebar-panel.tsx`), making them efficient to fix together.
- Tasks C and D affect files already edited in cycle 9, so regression risk is minimal.
