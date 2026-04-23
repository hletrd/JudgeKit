# UI/UX Review — RPF Cycle 30

**Date:** 2026-04-23
**Reviewer:** designer
**Base commit:** 31afd19b

## Previously Fixed Items (Verified)

- Clarification i18n (quick-answer text): Fixed (commit 7e0b3bb8). Verified Korean translations.
- Progress bar aria-label: Fixed (commit 3530a989). Verified `aria-label={tNav("progress")}`.
- Korean letter-spacing compliance: Maintained across codebase. Verified conditional tracking only applied when `locale !== "ko"`.

## DES-1: Exam countdown timer `setInterval` may cause momentary display glitch on tab switch [MEDIUM/MEDIUM]

**File:** `src/components/exam/countdown-timer.tsx:117`

**UX impact:** During an exam, the countdown timer is the most critical UI element. If a student switches tabs and returns, the `setInterval` catch-up behavior may cause the timer display to briefly show an incorrect value before correcting. While the correction happens quickly, seeing the time "jump" can cause anxiety during a high-stakes exam.

**Accessibility concern:** The `aria-live` region on line 145-146 announces threshold warnings. If the `setInterval` catch-up causes the `remaining` state to briefly cross a threshold boundary (e.g., from 5:01 to 4:59), the threshold announcement and toast may fire prematurely or incorrectly before the correct value is recalculated.

The countdown timer's `role="timer"` (line 139) means screen readers may also announce the incorrect intermediate value.

**Fix:** Migrate to recursive `setTimeout` to prevent catch-up behavior entirely, ensuring the timer display is always accurate.

---

## DES-2: Chat widget minimized state does not show notification for new assistant messages [LOW/LOW]

**File:** `src/lib/plugins/chat-widget/chat-widget.tsx:245-260`

When the chat widget is minimized (line 245-260), it shows a badge with the count of assistant messages. However, when a new message arrives while minimized, there is no visual animation or notification beyond the count badge updating. Users who are not watching the minimized widget may not notice new responses.

This is a minor UX improvement — not a functional bug.

**Fix:** Could add a brief pulse animation on the minimized button when a new message arrives.

---

## Designer Findings (carried/deferred)

### DES-CARRIED-1: Dialog semantics for submission overview — carried from DEFER-41
