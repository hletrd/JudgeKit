# RPF Cycle 42 — Designer (UI/UX)

**Date:** 2026-04-23
**Base commit:** 8912b987
**Reviewer angle:** UI/UX review, accessibility, information architecture

## Findings

### DES-1: Chat widget minimized button badge lacks ARIA live-region announcement [LOW/LOW]

**File:** `src/lib/plugins/chat-widget/chat-widget.tsx:284-288`

**Description:** The minimized chat widget button shows a badge with the count of assistant messages. While the `aria-label` includes the count text, there is no `aria-live` region to announce new messages when the widget is minimized. Screen reader users would not be notified of new assistant responses unless they re-focus the button. This is a carry-over from prior cycles.

**Fix:** Add `aria-live="polite"` to the badge or use a visually hidden live region that announces new messages.

**Confidence:** Low

---

### DES-2: Chat widget textarea `aria-label` uses placeholder text instead of descriptive label [LOW/LOW]

**File:** `src/lib/plugins/chat-widget/chat-widget.tsx:369`

**Description:** The textarea's `aria-label` is set to `t("placeholder")` which is the placeholder text ("Ask something..."). While functional, this is not a best practice — the aria-label should describe the field's purpose (e.g., "Chat message input") rather than using placeholder text which may be generic.

**Fix:** Use a dedicated translation key for the aria-label.

**Confidence:** Low

---

## Carry-Over Items

- Prior DES-1: Chat widget button badge lacks ARIA announcement (deferred, LOW/LOW)

## Sweep: Files Reviewed

- `src/lib/plugins/chat-widget/chat-widget.tsx`
- `src/components/exam/anti-cheat-monitor.tsx`
- `src/components/exam/countdown-timer.tsx`
- `src/components/problem/problem-submission-form.tsx`
- `src/app/(dashboard)/dashboard/admin/audit-logs/page.tsx`
- `src/app/(auth)/login/login-form.tsx`
- `src/app/(auth)/signup/signup-form.tsx`
