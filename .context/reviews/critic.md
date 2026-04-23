# Critic Review — RPF Cycle 18

**Date:** 2026-04-22
**Reviewer:** critic
**Base commit:** d32f2517

## CRI-1: `participant-anti-cheat-timeline.tsx` `formatDetailsJson` hardcoded English — i18n violation [MEDIUM/HIGH]

**File:** `src/components/contest/participant-anti-cheat-timeline.tsx:45-63`
**Confidence:** HIGH

This is the most impactful finding this cycle. The `formatDetailsJson` function returns hardcoded English strings ("Target: Code editor", "Target: Problem description") in a component that otherwise uses `useTranslations`. This is a functional i18n bug, not just a style concern.

**Concrete failure:** Korean locale users see English strings in the anti-cheat timeline details expansion.

**Fix:** Convert to a component method that uses `t()`, or pass `t` as a parameter.

---

## CRI-2: Duplicate `formatDuration` in two components — shared utility gap [LOW/MEDIUM]

**Files:**
- `src/components/exam/countdown-timer.tsx:17-24`
- `src/components/layout/active-timed-assignment-sidebar-panel.tsx:16-23`

**Confidence:** HIGH

Two identical `formatDuration` functions exist. The `formatting.ts` module already centralizes other formatting utilities but doesn't include duration formatting. This is a DRY violation.

**Fix:** Add `formatDuration` to `src/lib/formatting.ts`.

---

## CRI-3: Stale plan files continue to accumulate — process debt [LOW/HIGH]

**Files:** `plans/open/` directory
**Confidence:** HIGH

Multiple plan files in `plans/open/` have been present since cycles 8-17 and may have items already implemented. While cycle 16 plan was updated, older plans may still have inaccurate status. This wastes review effort and creates confusion about what remains.

**Fix:** Audit all open plan files and archive those where all items are DONE. This was previously flagged as AGG-6 in cycle 19 and remains relevant.

---

## CRI-4: `recruiter-candidates-panel.tsx` uses export endpoint for display — architectural mismatch [MEDIUM/MEDIUM]

**File:** `src/components/contest/recruiter-candidates-panel.tsx:50-53`
**Confidence:** HIGH

Same finding as CR-1 and PERF-1. The export endpoint is designed for bulk data download, not for paginated display. This is an architectural concern because it couples the display component to the export API contract.

---

## Verified Safe

- All cycle-16/17 fixes confirmed working (apiFetchJson migration, AbortController, aria-labels)
- Korean letter-spacing compliance maintained
- No new `as any` or `@ts-ignore` introduced
- i18n keys used consistently in new code except for `formatDetailsJson`
