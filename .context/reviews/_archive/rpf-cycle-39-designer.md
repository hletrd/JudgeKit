# Designer Review — Cycle 39

**Date:** 2026-04-23
**Reviewer:** designer
**Base commit:** c176d8f5

## DES-1: API key auto-dismiss dialog has no countdown indicator [LOW/LOW]

**File:** `src/app/(dashboard)/dashboard/admin/api-keys/api-keys-client.tsx:113-120`

**Description:** The 5-minute auto-dismiss timer (added in cycle 38) silently clears the raw API key from state. The admin sees no visual indication that the key will disappear. This could lead to confusion if the admin walks away and returns to find the dialog has closed. The original plan noted the countdown indicator as "optional."

**Concrete failure scenario:** An admin creates an API key and starts to copy it. A colleague asks a question. The admin returns 5+ minutes later to find the dialog closed. The raw key is gone permanently (server returns 410 Gone on re-fetch).

**Fix:** Add a small countdown text (e.g., "This key will be hidden in 3:42") near the key display area.

**Confidence:** Low (UX polish)

---

## DES-2: Chat widget minimized badge shows assistant message count but not total [LOW/LOW]

**File:** `src/lib/plugins/chat-widget/chat-widget.tsx:281-289`

**Description:** The minimized chat widget button shows the count of assistant messages as a badge. However, this count doesn't include user messages. If the user sends 5 messages and gets 5 responses, the badge shows "5", which is the number of complete exchanges. If the user sends a message and the assistant hasn't responded yet (streaming in progress), the badge shows the previous count. This is not a bug, but the count could be confusing.

**Confidence:** Low (design choice)

---

## Accessibility Assessment

- Chat widget error div now has `role="alert"` (fixed in cycle 38) -- verified working
- Minimized chat widget button has descriptive `aria-label` with message count (fixed in cycle 38) -- verified working
- API key table buttons have proper `aria-label` attributes
- Dialog components use proper `DialogTitle` and `DialogDescription` for screen readers
- Countdown timer uses `aria-live` for threshold announcements

## No New Accessibility Issues Found
