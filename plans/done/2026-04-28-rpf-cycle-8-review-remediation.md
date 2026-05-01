# Cycle 8 Review Remediation Plan

**Date:** 2026-04-28
**Source:** `.context/reviews/_aggregate.md` (cycle 8)
**Status:** DONE

---

## Tasks

### Task A: [MEDIUM] Pass locale to `formatBytes` in create-problem-form and compiler-client

- **Source:** C8-AGG-1 (C8-CR-1)
- **Files:**
  - `src/app/(dashboard)/dashboard/problems/create/create-problem-form.tsx` — import `useLocale`, pass locale to `formatBytes` calls on lines 893 and 934
  - `src/components/code/compiler-client.tsx` — import `useLocale`, pass locale to `formatBytes` call on line 115
- **Fix:**
  1. In `create-problem-form.tsx`:
     - Add `import { useLocale } from "next-intl";`
     - Add `const locale = useLocale();` in the component body
     - Change `formatBytes(testCase.input.length)` to `formatBytes(testCase.input.length, locale)` (line 893)
     - Change `formatBytes(testCase.expectedOutput.length)` to `formatBytes(testCase.expectedOutput.length, locale)` (line 934)
  2. In `compiler-client.tsx`:
     - Add `import { useLocale } from "next-intl";`
     - Add `const locale = useLocale();` in the component body
     - Change `formatBytes(content.length)` to `formatBytes(content.length, locale)` (line 115)
- **Exit criteria:** All `formatBytes` calls in the codebase pass `locale` argument
- [x] Done

### Task B: [MEDIUM] Pass locale to `formatNumber` in `system-info.ts` or document decision

- **Source:** C8-AGG-2 (C8-CR-2)
- **Files:**
  - `src/lib/system-info.ts:63` — `formatNumber(speedMHz / 1000, { maximumFractionDigits: 1 })`
- **Fix:**
  1. Option A (preferred): The `formatFrequency` function is called deep inside a server utility chain (`formatFrequency` -> `formatCpuLabel` -> `detectRuntimeSystemInfo` -> `getRuntimeSystemInfo`). Since `system-info.ts` is a server-side module that caches its result, adding locale here would require threading it through multiple function signatures for a low-value benefit (CPU frequency is technical data).
  2. Option B (pragmatic): Add a JSDoc comment documenting that `formatFrequency` intentionally uses `en-US` for technical data display, since CPU frequencies are universally displayed in Western format regardless of locale.
  3. Choose Option B: add a comment documenting the deliberate `en-US` default.
- **Exit criteria:** The `formatNumber` call in `system-info.ts` has a clear comment explaining the locale default decision
- [x] Done

### Task C: [MEDIUM] Extract contest status label map to shared utility and unify types

- **Source:** C8-AGG-3 (C8-AGG-6)
- **Files:**
  - `src/app/(public)/_components/contest-status-styles.ts` — add `buildContestStatusLabels` function and re-export `ContestStatus` type
  - `src/app/(public)/contests/page.tsx:57-62` — remove local `statusLabels`, import from shared
  - `src/app/(public)/contests/[id]/page.tsx:107-113` — remove local `statusLabels`, import from shared
  - `src/app/(dashboard)/dashboard/contests/page.tsx:91-97` — remove local `statusLabelMap`, import from shared
- **Fix:**
  1. In `contest-status-styles.ts`:
     - Import `ContestStatus` from `@/lib/assignments/contests` and re-export it
     - Replace local `ContestStatusKey` type with re-exported `ContestStatus` (or type alias)
     - Add `buildContestStatusLabels(t: (key: string) => string): Record<ContestStatus, string>` function:
       ```ts
       export function buildContestStatusLabels(t: (key: string) => string): Record<ContestStatus, string> {
         return {
           upcoming: t("contests.status.upcoming"),
           open: t("contests.status.open"),
           in_progress: t("contests.status.inProgress"),
           expired: t("contests.status.expired"),
           closed: t("contests.status.closed"),
         };
       }
       ```
  2. Update `contests/page.tsx`: Replace local `statusLabels` with `const statusLabels = buildContestStatusLabels(t);`
  3. Update `contests/[id]/page.tsx`: Replace local `statusLabels` with `const statusLabels = buildContestStatusLabels(t);`
  4. Update `dashboard/contests/page.tsx`: Replace local `statusLabelMap` with `const statusLabelMap = buildContestStatusLabels(t);`
  5. Fix any import references that used `ContestStatusKey` to use `ContestStatus` instead
  6. Fix the misplaced JSDoc comment (C8-AGG-5) while editing this file
- **Exit criteria:** Contest status labels defined in a single place; `ContestStatus` and `ContestStatusKey` unified; all 3 pages use shared function
- [x] Done

### Task D: [LOW] Add dark mode and `text-white` to active badge on user detail page

- **Source:** C8-AGG-4 (C8-CR-4)
- **Files:**
  - `src/app/(dashboard)/dashboard/admin/users/[id]/page.tsx:119`
- **Fix:**
  1. Change `<Badge className="bg-green-500">` to `<Badge className="bg-green-500 text-white dark:bg-green-600 dark:text-white">`
- **Exit criteria:** Active badge has consistent styling with other colored badges
- [x] Done

### Task E: [LOW] Add dark mode variants to language config table progress bar

- **Source:** C8-AGG-7 (C8-CR-7)
- **Files:**
  - `src/app/(dashboard)/dashboard/admin/languages/language-config-table.tsx:338`
- **Fix:**
  1. Change the className template to include dark mode variants:
     ```
     ${usagePercent > 90 ? "bg-red-500 dark:bg-red-600" : usagePercent > 70 ? "bg-yellow-500 dark:bg-yellow-600" : "bg-green-500 dark:bg-green-600"}
     ```
- **Exit criteria:** Progress bar has dark mode variants for all color states
- [x] Done

---

## Deferred Items

The following findings from the cycle 8 review are deferred this cycle with reasons:

| C8-AGG ID | Description | Severity | Reason for deferral | Exit criterion |
|-----------|-------------|----------|---------------------|----------------|
| (none) | | | | |

All findings are scheduled for implementation this cycle.

---

## Notes

- C8-AGG-1 (formatBytes missing locale) is the same bug class as C4-B/C (formatScore) and C7-AGG-1 (formatDifficulty), which were fixed in cycles 4-5 and 7 respectively. The pattern is: formatting functions with a `locale` parameter defaulting to `en-US`, called without passing the available locale. This class of bug keeps appearing because the `locale` parameter has a default value, so the code compiles and works for English users but is incorrect for other locales.
- C8-AGG-3 (contest status label duplication) is the same class as C2-AGG-8/C5-AGG-1/C6-AGG-1/C7-AGG-3 where utility functions were progressively extracted. The label map is the last remaining piece of contest status duplication.
- C8-AGG-5 (misplaced JSDoc) was likely introduced during cycle 7 when `getContestStatusBadgeVariant` was added above `getContestStatusBorderClass` without moving the JSDoc. It will be fixed as part of Task C since the same file is being edited.
