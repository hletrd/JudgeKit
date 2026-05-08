# Designer Review — Cycle 12/100

**Reviewer:** designer (orchestrator direct)
**Date:** 2026-05-08
**HEAD:** e584aeac
**Scope:** UI/UX review — information architecture, affordances, focus/keyboard navigation, accessibility, responsive breakpoints, loading/empty/error states, form validation UX, dark/light mode, i18n

---

## NEW FINDINGS

### C12-DS-1 — CountdownTimer shows stale "00:00:00" when exam deadline extends
- **Severity:** LOW
- **Confidence:** MEDIUM
- **File:** `src/components/exam/countdown-timer.tsx`
- **Problem:** If an exam administrator extends the deadline while a student is viewing the countdown, the component continues to display "00:00:00" in the destructive/red variant instead of recalculating the new remaining time. From the student's perspective, the exam appears to have ended even though it hasn't.
- **UX impact:** Students may panic, submit prematurely, or navigate away from the exam thinking time has expired. The mismatch between actual server-side deadline and displayed countdown undermines trust in the timer.
- **Fix:** Reset `expired` state and recompute thresholds when `deadline` prop changes.

---

## No Other UI/UX Issues Found

Keyboard navigation in compiler client (Ctrl+Enter) is properly implemented. Focus trapping in dialogs works correctly. The anti-cheat privacy notice prevents dismissal until accepted. Toast notifications are accessible with aria-live regions. Dark/light mode toggling is persisted correctly. Responsive breakpoints are handled in the layout components.
