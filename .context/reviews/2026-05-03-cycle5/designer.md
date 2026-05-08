# Designer (UI/UX) Review — Cycle 5 (2026-05-03)

**HEAD reviewed:** `eb4429a5`

---

## C5-UX-1 (MEDIUM, HIGH confidence) — `compileOutput` tooltip on public submissions list is an information leak with UX implications

**Files:** `src/components/submission-status-badge.tsx:71-79`, `src/app/(public)/submissions/page.tsx`

From a UX perspective, showing compiler errors on a public submissions list is inconsistent with the detail page behavior (which hides compile output for non-owners). Users who see the tooltip on the list page would expect the same level of detail on the detail page, creating a confusing experience when the detail page shows "compile output hidden" but the list page already revealed it via tooltip.

**Recommendation:** For guests, the badge should show only the status label (e.g., "Compile Error") without the tooltip. This is consistent with the detail page and avoids the information leak.

---

## C5-UX-2 (LOW, MEDIUM confidence) — Public submissions page: no visual distinction between guest and logged-in views

**File:** `src/app/(public)/submissions/page.tsx`

Guests and logged-in users see the same layout for the submissions list, but guests cannot use the "Mine" scope filter or see certain details. There is no visual indicator that the view is limited for guests. Consider showing a subtle "Sign in to see your submissions" prompt.

**Status:** LOW — design enhancement, not a bug.

---

## C5-UX-3 (LOW, LOW confidence) — `SubmissionStatusBadge` tooltip has no keyboard accessible trigger

**File:** `src/components/submission-status-badge.tsx:166`

The tooltip trigger is a `<button type="button">` which is keyboard-focusable, but the tooltip content is only visible on hover/focus. Screen reader users may not discover the compileOutput content. This is a WCAG 2.2 accessibility concern.

**Fix:** Add `aria-describedby` pointing to the tooltip content, or use a `<details>/<summary>` pattern for the compile error disclosure.

---

## No other UI/UX findings
