# UI/UX Review — RPF Cycle 22

**Date:** 2026-04-22
**Reviewer:** designer
**Base commit:** 88abca22

## DES-1: `create-problem-form.tsx` numeric inputs lack inline validation feedback [LOW/MEDIUM]

**File:** `src/app/(dashboard)/dashboard/problems/create/create-problem-form.tsx:464-471,476-487`
**Confidence:** MEDIUM

The sequence number and difficulty inputs use `type="number"` which provides browser-level validation, but when the value is programmatically invalid (e.g., via DevTools or accessibility tools), no visual feedback is shown. Other form fields in the codebase show inline errors on validation failure. The sequence number input at line 469 sets `setSequenceNumber(e.target.value)` as raw string with no validation feedback.

**Concrete failure scenario:** A user enters an invalid sequence number. The `type="number"` constraint prevents most invalid input in browsers, but the lack of explicit error styling means there's no visual cue if the browser validation is bypassed or fails.

**Fix:** Add conditional error styling or a helper text message when the field value is non-empty and non-numeric.

---

## Previously Fixed — Verified

- `anti-cheat-dashboard.tsx` expand/collapse buttons now have `aria-controls` (cycle 21 AGG-6 fix confirmed)
- `contest-replay.tsx` range slider now has `aria-valuetext` (cycle 21 AGG-7 fix confirmed)
- `active-timed-assignment-sidebar-panel.tsx` progress bar `aria-valuenow` uses precise value (cycle 21 AGG-8 fix confirmed)

---

## Verified Safe

- All icon-only buttons have `aria-label`
- Dialog components use proper focus trapping
- `countdown-timer.tsx` uses `aria-live="polite"` for non-critical announcements, `aria-live="assertive"` for 1-minute warning
- Anti-cheat privacy notice uses Dialog component with focus trapping
- Korean letter-spacing properly conditional throughout
- Mobile menu sign-out button meets WCAG minimum of 24px touch target
- `code-timeline-panel.tsx` snapshot dots have `aria-label`
- `contest-join-client.tsx` access code input has proper `id`, `autoFocus`, and `maxLength`
