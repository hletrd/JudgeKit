# UI/UX Review — RPF Cycle 18

**Date:** 2026-04-22
**Reviewer:** designer
**Base commit:** d32f2517

## DES-1: `code-timeline-panel.tsx` mini-timeline dots lack `aria-label` — WCAG 4.1.2 [LOW/MEDIUM]

**File:** `src/components/contest/code-timeline-panel.tsx:170-179`
**Confidence:** HIGH

The mini-timeline uses `<button>` elements with `title` attributes for snapshot selection. While the navigation prev/next buttons have proper `aria-label`, the individual snapshot dots only have `title={formatTime(s.createdAt)}`. The `title` attribute is not reliably read by screen readers. Users navigating via keyboard cannot understand which snapshot each dot represents.

**Fix:** Add `aria-label` like `aria-label={t("snapshotNofM", { current: i + 1, total: snapshots.length })}` and add the corresponding i18n key.

---

## DES-2: `participant-anti-cheat-timeline.tsx` expand/collapse details buttons lack `aria-controls` [LOW/LOW]

**File:** `src/components/contest/participant-anti-cheat-timeline.tsx:275-292`
**Confidence:** MEDIUM

The expand/collapse buttons use `aria-expanded` but don't have `aria-controls` pointing to the panel they control. This makes it harder for screen reader users to understand the relationship between the button and the expanded content.

**Fix:** Add an `id` to the expanded `<pre>` element and reference it via `aria-controls`.

---

## DES-3: `active-timed-assignment-sidebar-panel.tsx` progress bar `aria-valuenow` uses rounded integer instead of precise value [LOW/LOW]

**File:** `src/components/layout/active-timed-assignment-sidebar-panel.tsx:170`
**Confidence:** LOW

The progress bar uses `aria-valuenow={Math.round(progressPercent)}` while the visual display shows one decimal place. For accessibility accuracy, the ARIA value should match the visual presentation.

**Fix:** Use `aria-valuenow={progressPercent}` (the value is already constrained 0-100).

---

## Verified Safe

- All icon-only buttons have `aria-label`
- Dialog components use proper focus trapping
- `countdown-timer.tsx` uses `aria-live="polite"` for non-critical announcements (fixed in cycle 17)
- Anti-cheat privacy notice uses Dialog component with focus trapping (fixed in cycle 17)
- Korean letter-spacing properly conditional throughout
- Mobile menu sign-out button meets WCAG minimum of 24px touch target
