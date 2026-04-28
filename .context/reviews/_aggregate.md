# Aggregate Review — Cycle 9

**Date:** 2026-04-28
**Reviewers:** code-reviewer (1 lane — focused verification + new findings)
**Total findings:** 0 HIGH, 2 MEDIUM, 4 LOW (deduplicated, new findings only)

---

## Cycle 1-8 Fix Verification Summary

All 34 tasks from cycles 1-8 were re-verified in the cycle 8 aggregate. No regressions found. Key verifications this cycle:

- All `formatBytes`, `formatScore`, `formatDifficulty` calls pass locale correctly
- `buildContestStatusLabels` is used by all 3 contest pages (public listing, public detail, dashboard)
- `ContestStatusKey` type fully eliminated — no references found
- Badge dark mode variants applied correctly (user detail active badge, language config progress bar)
- `system-info.ts` has documented JSDoc explaining the deliberate `en-US` locale default

---

## Deduplicated Findings (sorted by severity)

### C9-AGG-1: [MEDIUM] SVG stacked bar chart segments missing dark mode fill variants

**Sources:** C9-CR-1 | **Confidence:** HIGH

`src/components/contest/analytics-charts.tsx:231,237` — SVG `rect` elements in `SVGStackedBar` use `fill-green-500` and `fill-yellow-500` without dark mode variants, while the zero segment (line 248) correctly has `fill-red-300 dark:fill-red-800`. This is inconsistent with the existing dark mode pattern in the same component.

**Fix:** Add `dark:fill-green-600` to line 231 and `dark:fill-yellow-600` to line 237.

---

### C9-AGG-2: [MEDIUM] Legend swatches in analytics chart missing dark mode variants

**Sources:** C9-CR-2 | **Confidence:** HIGH

`src/components/contest/analytics-charts.tsx:612,616` — Legend color swatches for "solved" and "partial" use `bg-green-500` and `bg-yellow-500` without dark mode variants, while "zero" swatch (line 620) correctly has `bg-red-300 dark:bg-red-800`. Same inconsistency pattern as C9-AGG-1.

**Fix:** Add `dark:bg-green-600` to line 612 and `dark:bg-yellow-600` to line 616.

---

### C9-AGG-3: [LOW] Progress bar in submission overview missing dark mode variant

**Sources:** C9-CR-3 | **Confidence:** HIGH

`src/components/lecture/submission-overview.tsx:167` — Acceptance progress bar uses `bg-green-500` without `dark:bg-green-600`. Same bug class as C8-AGG-7 (language config table progress bar), which was fixed in cycle 8.

**Fix:** Change to `bg-green-500 dark:bg-green-600`.

---

### C9-AGG-4: [LOW] Text color classes in submission overview missing dark mode variants

**Sources:** C9-CR-4 | **Confidence:** MEDIUM

`src/components/lecture/submission-overview.tsx:163,173,204-206` — Several `text-{color}-500` classes are used without dark mode variants. In dark mode, 500-level text colors against dark backgrounds may have insufficient contrast. Adding `dark:text-green-400`, `dark:text-blue-400`, `dark:text-red-400` would improve accessibility.

**Fix:** Add dark mode text color variants (400 level) for improved contrast in dark mode.

---

### C9-AGG-5: [LOW] Anti-cheat dashboard icon background missing dark mode variant

**Sources:** C9-CR-5 | **Confidence:** LOW

`src/components/contest/anti-cheat-dashboard.tsx:398` — Icon background uses `bg-orange-500/10` without a dark mode variant. At 10% opacity, this is subtle enough to work in both themes, but for consistency with the established dark mode pattern:

**Fix:** Optional — add `dark:bg-orange-500/15` for slightly more visibility in dark mode.

---

### C9-AGG-6: [LOW] Anti-cheat event type SVG chart palette missing dark mode variants

**Sources:** C9-CR-6 | **Confidence:** LOW

`src/components/contest/analytics-charts.tsx:418-425` — The `SVGEventTypeBar` component uses a hardcoded palette of SVG fill classes (`fill-orange-500`, `fill-red-500`, etc.) without dark mode variants. These are used in SVG rect elements for anti-cheat event type visualization.

**Fix:** Consider adding dark mode variants to the palette or using conditional class application.

---

## Carried Deferred Items (unchanged from cycle 8)

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
- C2-AGG-9/C3-AGG-5/C4-AGG-4: `getDbNow` called redundantly — LOW, deferred
- C2-AGG-10: CountdownTimer namespace mismatch — LOW, deferred

---

## No Agent Failures

The review lane completed successfully.

---

## Gate Status

- **eslint:** Not yet run this cycle
- **tsc --noEmit:** Not yet run this cycle
- **next build:** Not yet run this cycle

---

## Plannable Tasks for This Cycle

1. **C9-AGG-1** (MEDIUM) — Add dark mode fill variants to SVG stacked bar chart segments
2. **C9-AGG-2** (MEDIUM) — Add dark mode variants to analytics chart legend swatches
3. **C9-AGG-3** (LOW) — Add dark mode variant to submission overview progress bar
4. **C9-AGG-4** (LOW) — Add dark mode text color variants in submission overview
5. **C9-AGG-5** (LOW) — Add dark mode variant to anti-cheat dashboard icon background
6. **C9-AGG-6** (LOW) — Add dark mode variants to anti-cheat event type SVG chart palette
