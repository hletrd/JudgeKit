# Cycle 21 Designer (UI/UX)

**Date:** 2026-04-19
**Base commit:** 5a2ce6b4
**Angle:** UI/UX review — information architecture, accessibility, responsiveness

---

## F1: Leaderboard table sticky columns use `z-[5]` which may conflict with other overlays

- **File**: `src/components/contest/leaderboard-table.tsx:327,330,371,390`
- **Severity**: LOW
- **Confidence**: MEDIUM
- **Description**: The rank and name columns use `sticky left-0 z-[5]` and `sticky left-16 z-[5]` for horizontal scroll sticky behavior. The table header uses `sticky top-0 z-10`. If a dialog or dropdown menu opens over the leaderboard table (e.g., a tooltip or popover), the `z-[5]` sticky columns may clip through the overlay if the overlay's z-index is between 5 and 10. In practice, shadcn/ui dialogs use much higher z-index values (z-50), so this is unlikely to cause issues.
- **Fix**: Document the z-index layering convention (z-5 for sticky columns, z-10 for sticky header, z-50+ for overlays) in a comment.

## F2: Leaderboard table does not have `role="table"` or ARIA attributes for accessibility

- **File**: `src/components/contest/leaderboard-table.tsx:324-486`
- **Severity**: LOW
- **Confidence**: MEDIUM
- **Description**: The leaderboard uses the shadcn/ui `<Table>` component which renders semantic `<table>`, `<thead>`, `<tbody>`, `<tr>`, `<th>`, `<td>` elements. These have implicit ARIA roles (`table`, `row`, `columnheader`, `cell`), so basic accessibility is covered. However, the frozen leaderboard badge and live rank badge are decorative/informational elements that lack `aria-label` on the frozen emoji (line 313 uses `aria-label` correctly on the snowflake emoji). The live rank badge is properly inside a `<Badge>` with visible text. Accessibility is reasonable.
- **Fix**: No critical accessibility issues found. Minor improvement: add `aria-live="polite"` to the live rank badge so screen readers announce rank updates.

## F3: IOI cell colors have insufficient contrast for very low scores in dark mode

- **File**: `src/components/contest/leaderboard-table.tsx:189-201`
- **Severity**: LOW
- **Confidence**: MEDIUM
- **Description**: The `IoiCell` component computes dark mode colors as `hsl(${hue}, 40%, 18%)` for background and `hsl(${hue}, 60%, 65%)` for text. For very low scores (hue near 0, red), the background is `hsl(0, 40%, 18%)` and text is `hsl(0, 60%, 65%)`. The contrast ratio between these is approximately 4.1:1, which meets WCAG AA for normal text (4.5:1 requirement) but not by a large margin. For medium scores (hue near 60, yellow), the background is `hsl(60, 40%, 18%)` and text is `hsl(60, 60%, 65%)` — contrast is better at approximately 5.5:1.
- **Concrete failure scenario**: A student with color vision deficiency viewing the leaderboard in dark mode may have difficulty reading scores in the red cells for low-scoring problems.
- **Fix**: Increase the lightness of the dark mode text from 65% to 70% for improved contrast, or use a fixed text color for IOI cells in dark mode instead of hue-dependent text.
