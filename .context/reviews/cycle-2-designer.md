# Designer Review — Cycle 2 (Fresh)

**Base commit:** 31049465
**Reviewer:** designer (UI/UX)
**Focus:** UI/UX, accessibility, responsive design, information architecture

---

## C2-DES-1 — CSS-only tooltips are inaccessible on touch devices
**Severity:** MEDIUM | **Confidence:** High
**File:** `src/components/contest/participant-timeline-bar.tsx:247-292`

The timeline event tooltips use `group-hover:block` which only works on hover (mouse). Touch device users cannot see tooltip content. The `tabIndex={0}` on snapshot markers (line 216) suggests keyboard accessibility was attempted, but there's no `onFocus` handler to show the tooltip.

**Fix:** Use a proper tooltip component (e.g., Radix UI Tooltip) that supports hover, focus, and touch.

---

## C2-DES-2 — Snapshot markers have `tabIndex={0}` but no keyboard interaction
**Severity:** MEDIUM | **Confidence:** High
**File:** `src/components/contest/participant-timeline-bar.tsx:213-221`

Snapshot divs are focusable (`tabIndex={0}`) but have no `onClick`, `onKeyDown`, or `role`. Keyboard users can tab to them but nothing happens. This is an accessibility trap.

**Fix:** Either make them non-focusable (remove `tabIndex`) or add meaningful keyboard interaction.

---

## C2-DES-3 — Timeline markers can overlap visually
**Severity:** LOW | **Confidence:** High
**File:** `src/components/contest/participant-timeline-bar.tsx:201-295`

Multiple events at similar times will render on top of each other. The markers are absolutely positioned with `-translate-x-1/2`, but there's no collision detection or spreading. On a dense timeline, clicking one marker might actually click another underneath.

**Fix:** Add a collision detection algorithm that offsets overlapping markers vertically, or use a zoomable timeline.

---

## C2-DES-4 — Mini timeline bars lack labels or interaction
**Severity:** LOW | **Confidence:** Medium
**File:** `src/components/contest/participant-timeline-bar.tsx:325-350`

The mini timeline bars inside each problem card show dots but no labels, tooltips, or interaction. Users can't tell what each dot represents without cross-referencing the main timeline.

**Fix:** Add tooltips to mini timeline dots or make them clickable links.

---

## C2-DES-5 — Color legend is redundant for single-problem assignments
**Severity:** LOW | **Confidence:** Medium
**File:** `src/components/contest/participant-timeline-bar.tsx:166-183`

The problem color legend always renders even when there's only one problem. This adds visual noise for simple cases.

**Fix:** Only show the legend when `assignmentProblems.length > 1`.

---

## C2-DES-6 — Time axis label "0m" is unclear for non-exam contexts
**Severity:** LOW | **Confidence:** Low
**File:** `src/components/contest/participant-timeline-bar.tsx:188-193`

The timeline shows "0m" at the left edge. For windowed exams, this represents exam start time. For practice submissions without an exam session, "0m" is relative to the first event, which may confuse users.

**Fix:** Add a context-aware label or tooltip explaining what "0m" represents.

---

## C2-DES-7 — Korean letter spacing not applied correctly (CLAUDE.md rule check)
**Severity:** LOW | **Confidence:** Medium
**File:** `src/components/contest/participant-timeline-bar.tsx` (and others)

The CLAUDE.md rule states: "Keep Korean text at the browser/font default letter spacing. Do not apply custom letter-spacing to Korean content."

Checked the timeline component and related files — no explicit `letter-spacing` or `tracking-*` utilities were found on Korean text elements. The Tailwind defaults appear correct.

**Conclusion:** Korean text follows the rule. No issue found.

---

## Commonly Missed Sweep

- Checked for focus traps: none found.
- Checked for reduced motion: no animations in timeline components.
- Checked for color contrast: the problem colors (`bg-blue-500`, etc.) on white backgrounds pass WCAG AA for large elements (markers are small but use white text on colored backgrounds).
- Responsive breakpoints: the grid uses `grid-cols-1 md:grid-cols-2 lg:grid-cols-3` — correct.
