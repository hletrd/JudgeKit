# Code Review — Cycle 9

**Date:** 2026-04-28
**Reviewer:** code-reviewer
**Scope:** Full codebase review focusing on cycle 1-8 fix verification, remaining issues, and new regressions

---

## Cycle 1-8 Fix Verification

All 34 tasks from cycles 1-8 have been re-verified in the cycle 8 aggregate. No regressions found in any prior fixes. All locale-aware formatting calls (`formatBytes`, `formatScore`, `formatDifficulty`) now correctly pass locale. Contest status labels are unified via `buildContestStatusLabels`. `ContestStatusKey` type has been eliminated in favor of `ContestStatus`. Badge dark mode variants applied correctly.

---

## New Findings

### C9-CR-1: [MEDIUM] SVG stacked bar chart segments missing dark mode fill variants

**File:** `src/components/contest/analytics-charts.tsx:231,237`
**Confidence:** HIGH

The SVG `rect` elements in `SVGStackedBar` use `fill-green-500` and `fill-yellow-500` without dark mode variants, while the zero segment (line 248) correctly uses `fill-red-300 dark:fill-red-800`. This is inconsistent.

```tsx
// Line 231: Missing dark variant
<rect ... className="fill-green-500">
// Line 237: Missing dark variant
<rect ... className="fill-yellow-500">
// Line 248: Correctly has dark variant
className="fill-red-300 dark:fill-red-800"
```

**Fix:** Add `dark:fill-green-600` and `dark:fill-yellow-600` variants.

---

### C9-CR-2: [MEDIUM] Legend swatches in analytics chart missing dark mode variants

**File:** `src/components/contest/analytics-charts.tsx:612,616`
**Confidence:** HIGH

The legend color swatches for "solved" and "partial" use `bg-green-500` and `bg-yellow-500` without dark mode variants, while the "zero" swatch (line 620) correctly uses `bg-red-300 dark:bg-red-800`.

```tsx
// Line 612: Missing dark variant
<span className="inline-block size-3 rounded bg-green-500" />
// Line 616: Missing dark variant
<span className="inline-block size-3 rounded bg-yellow-500" />
// Line 620: Correct
<span className="inline-block size-3 rounded bg-red-300 dark:bg-red-800" />
```

**Fix:** Add `dark:bg-green-600` and `dark:bg-yellow-600` variants.

---

### C9-CR-3: [LOW] Progress bar in submission overview missing dark mode variant

**File:** `src/components/lecture/submission-overview.tsx:167`
**Confidence:** HIGH

The acceptance progress bar uses `bg-green-500` without dark mode variant:

```tsx
<div className="h-full rounded-full bg-green-500 transition-all duration-500" style={{ width: `${acceptedPct}%` }} />
```

This is the same pattern as C8-AGG-7 (language config table progress bar), which was fixed in cycle 8.

**Fix:** Add `dark:bg-green-600` variant.

---

### C9-CR-4: [LOW] Text color classes in submission overview missing dark mode variants

**File:** `src/components/lecture/submission-overview.tsx:163,173,204-206`
**Confidence:** MEDIUM

Several `text-{color}-500` classes are used without dark mode variants:
- Line 163: `text-green-500` for accepted percentage display
- Line 173: `text-green-500` on CheckCircle2 icon
- Lines 204-206: `text-green-500`, `text-blue-500`, `text-red-500` for status labels

Tailwind's `text-green-500` may have insufficient contrast in dark mode against dark backgrounds. Adding `dark:text-green-400`, `dark:text-blue-400`, `dark:text-red-400` would improve accessibility.

**Fix:** Add dark mode text color variants for improved contrast.

---

### C9-CR-5: [LOW] Anti-cheat dashboard icon background missing dark mode variant

**File:** `src/components/contest/anti-cheat-dashboard.tsx:398`
**Confidence:** LOW

The icon background uses `bg-orange-500/10` (10% opacity orange) without a dark mode variant. At 10% opacity, this is a very subtle effect and likely acceptable in both themes, but for consistency with the pattern used elsewhere:

```tsx
<div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-orange-500/10">
```

**Fix:** Optional — add `dark:bg-orange-500/15` for slightly more visibility in dark mode.

---

### C9-CR-6: [LOW] Anti-cheat event type SVG chart palette missing dark mode variants

**File:** `src/components/contest/analytics-charts.tsx:418-425`
**Confidence:** LOW

The `SVGEventTypeBar` component uses a hardcoded palette of SVG fill classes without dark mode variants:

```tsx
const colors = [
  "fill-orange-500",
  "fill-red-500",
  "fill-purple-500",
  "fill-pink-500",
  "fill-amber-500",
  "fill-rose-600",
];
```

These are used in SVG rect elements for anti-cheat event type visualization. While the 500-level colors are generally readable in both themes, `fill-orange-500` and `fill-amber-500` may be too bright in dark mode.

**Fix:** Consider adding dark mode variants to the palette array or using conditional class application.

---

## Carried Deferred Items (unchanged from cycle 8)

All prior deferred items remain valid and unchanged. No new findings justify changing their deferral status.
