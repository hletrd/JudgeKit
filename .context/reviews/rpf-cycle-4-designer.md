# RPF Cycle 4 — Designer

**Date:** 2026-04-22
**Base commit:** 5d89806d

## Findings

### DES-1: Countdown timer drift creates jarring UX in exam context [MEDIUM/HIGH]

**File:** `src/components/exam/countdown-timer.tsx:100`
**Confidence:** HIGH

When a student switches tabs during an exam and switches back, the countdown timer shows a stale value that "jumps" to the correct time on the next interval tick. This is a significant UX problem because:

1. **Perceived time accuracy**: Students rely on the countdown to manage their time. A timer that jumps creates distrust and anxiety.
2. **Accessibility**: The `role="timer"` and `aria-live="assertive"` attributes are correctly set, but the stale value is announced to screen readers, providing incorrect information.
3. **Time management**: A student who sees 25:00 remaining (stale) instead of 20:00 (actual) may allocate their time incorrectly for the remaining problems.

**Fix:** Add a `visibilitychange` listener that immediately recalculates `remaining` when the tab becomes visible. The calculation is simple: `deadline - (Date.now() + offsetRef.current)`. This ensures the displayed time is always accurate when the user is looking at it.

---

### DES-2: `access-code-manager.tsx` copy feedback is minimal [LOW/LOW]

**File:** `src/components/contest/access-code-manager.tsx:150`
**Confidence:** LOW

The copy button shows "Copied" text feedback after copying, but there's no visual animation or color change on the button itself. The `recruiting-invitations-panel.tsx` uses a `Check` icon to indicate successful copy, which provides better visual feedback. This is a minor consistency issue.

---

### DES-3: Contest management UI components use consistent patterns [VERIFIED]

The contest management area (`recruiting-invitations-panel.tsx`, `access-code-manager.tsx`, `invite-participants.tsx`, `contest-announcements.tsx`, `contest-clarifications.tsx`) all follow consistent UI patterns:
- Card-based layout
- Badge variants for status indicators
- AlertDialog for destructive actions
- Consistent toast feedback
- Consistent loading states

---

## Verified Safe

- Korean text uses default letter-spacing per CLAUDE.md rules (verified in `active-timed-assignment-sidebar-panel.tsx` which explicitly checks `locale !== "ko"`)
- All form labels are properly associated with inputs via `htmlFor`/`id`
- Loading states are shown during async operations
- Error states provide user-actionable feedback
- Dark mode is properly supported across all contest management components
