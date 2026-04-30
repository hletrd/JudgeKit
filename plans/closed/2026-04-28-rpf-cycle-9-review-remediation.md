# Cycle 9 Review Remediation Plan

**Date:** 2026-04-28
**Source:** `.context/reviews/_aggregate.md` (cycle 9)
**Status:** DONE

---

## Tasks

### Task A: [MEDIUM] Add dark mode fill variants to SVG stacked bar chart segments

- **Source:** C9-AGG-1 (C9-CR-1)
- **Files:**
  - `src/components/contest/analytics-charts.tsx:231` — `fill-green-500` missing dark variant
  - `src/components/contest/analytics-charts.tsx:237` — `fill-yellow-500` missing dark variant
- **Fix:**
  1. Change `className="fill-green-500"` to `className="fill-green-500 dark:fill-green-600"` (line 231)
  2. Change `className="fill-yellow-500"` to `className="fill-yellow-500 dark:fill-yellow-600"` (line 237)
- **Exit criteria:** All SVG rect elements in SVGStackedBar have dark mode fill variants, matching the zero segment pattern
- [x] Done

### Task B: [MEDIUM] Add dark mode variants to analytics chart legend swatches

- **Source:** C9-AGG-2 (C9-CR-2)
- **Files:**
  - `src/components/contest/analytics-charts.tsx:612` — `bg-green-500` missing dark variant
  - `src/components/contest/analytics-charts.tsx:616` — `bg-yellow-500` missing dark variant
- **Fix:**
  1. Change `bg-green-500` to `bg-green-500 dark:bg-green-600` (line 612)
  2. Change `bg-yellow-500` to `bg-yellow-500 dark:bg-yellow-600` (line 616)
- **Exit criteria:** Legend swatches have dark mode variants matching the zero swatch pattern
- [x] Done

### Task C: [LOW] Add dark mode variant to submission overview progress bar

- **Source:** C9-AGG-3 (C9-CR-3)
- **Files:**
  - `src/components/lecture/submission-overview.tsx:167` — `bg-green-500` missing dark variant
- **Fix:**
  1. Change `bg-green-500` to `bg-green-500 dark:bg-green-600`
- **Exit criteria:** Progress bar has dark mode variant, consistent with C8-AGG-7 fix
- [x] Done

### Task D: [LOW] Add dark mode text color variants in submission overview

- **Source:** C9-AGG-4 (C9-CR-4)
- **Files:**
  - `src/components/lecture/submission-overview.tsx:163` — `text-green-500` missing dark variant
  - `src/components/lecture/submission-overview.tsx:173` — `text-green-500` on icon missing dark variant
  - `src/components/lecture/submission-overview.tsx:204-206` — `text-green-500`, `text-blue-500`, `text-red-500` missing dark variants
- **Fix:**
  1. Change `text-green-500` to `text-green-500 dark:text-green-400` (line 163)
  2. Change `text-green-500` to `text-green-500 dark:text-green-400` (line 173)
  3. Change status label colors: `text-green-500 dark:text-green-400`, `text-blue-500 dark:text-blue-400`, `text-red-500 dark:text-red-400` (lines 204-206)
- **Exit criteria:** All text color classes have dark mode variants for improved contrast
- [x] Done

### Task E: [LOW] Add dark mode variant to anti-cheat dashboard icon background

- **Source:** C9-AGG-5 (C9-CR-5)
- **Files:**
  - `src/components/contest/anti-cheat-dashboard.tsx:398` — `bg-orange-500/10` missing dark variant
- **Fix:**
  1. Change `bg-orange-500/10` to `bg-orange-500/10 dark:bg-orange-500/15`
- **Exit criteria:** Icon background has slightly stronger visibility in dark mode
- [x] Done

### Task F: [LOW] Add dark mode variants to anti-cheat event type SVG chart palette

- **Source:** C9-AGG-6 (C9-CR-6)
- **Files:**
  - `src/components/contest/analytics-charts.tsx:418-425` — SVG fill palette without dark variants
- **Fix:**
  1. Since the palette is used dynamically (array indexed), add dark variants to each class string:
     - `"fill-orange-500 dark:fill-orange-600"`
     - `"fill-red-500 dark:fill-red-600"`
     - `"fill-purple-500 dark:fill-purple-600"`
     - `"fill-pink-500 dark:fill-pink-600"`
     - `"fill-amber-500 dark:fill-amber-600"`
     - `"fill-rose-600 dark:fill-rose-700"`
  2. Tailwind JIT should handle the compound class strings correctly.
- **Exit criteria:** Anti-cheat event type chart bars have dark mode fill variants
- [x] Done

---

## Deferred Items

The following findings from the cycle 9 review are deferred this cycle with reasons:

| C9-AGG ID | Description | Severity | Reason for deferral | Exit criterion |
|-----------|-------------|----------|---------------------|----------------|
| (none) | | | | |

All findings are scheduled for implementation this cycle.

---

## Notes

- All 6 findings this cycle are dark mode consistency issues. The pattern is: color classes (bg-*, text-*, fill-*) at the 500 level without corresponding dark: variants at the 600 level. This is the same bug class that was progressively fixed in cycles 4-8 for badges, progress bars, and other UI elements.
- The analytics-charts.tsx file accounts for 4 of the 6 findings (Tasks A, B, E, F), making it efficient to fix in a single pass.
- The submission-overview.tsx file accounts for 2 findings (Tasks C, D), also efficient to fix together.
