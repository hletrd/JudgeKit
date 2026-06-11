# Designer Review — RPF Cycle 38

**Date:** 2026-04-23
**Reviewer:** designer
**Base commit:** 4dd3d951

## Inventory of Files Reviewed

- `src/lib/plugins/chat-widget/chat-widget.tsx` — Chat widget UI
- `src/components/exam/countdown-timer.tsx` — Timer UI
- `src/components/exam/anti-cheat-monitor.tsx` — Privacy dialog
- `src/app/(dashboard)/dashboard/admin/api-keys/api-keys-client.tsx` — API key management UI
- `src/components/contest/recruiting-invitations-panel.tsx` — Invitation panel

## Findings

### DES-1: Chat widget error message lacks `role="alert"` — screen readers don't announce errors [MEDIUM/MEDIUM]

**File:** `src/lib/plugins/chat-widget/chat-widget.tsx:353-356`

**Description:** Same as CR-3. The error message div has no ARIA role. Screen readers will not announce the error when it appears. The messages container has `role="log"` (line 320) which announces new messages, but the error div is separate from the message flow.

**Concrete failure scenario:** A screen reader user sends a chat message. The rate limit is hit and an error appears visually. The user hears nothing and waits for a response that will never come.

**Fix:** Add `role="alert"` to the error div.

**Confidence:** High

---

### DES-2: API key created-key dialog has no auto-dismiss — raw key visible indefinitely [LOW/MEDIUM]

**File:** `src/app/(dashboard)/dashboard/admin/api-keys/api-keys-client.tsx:288-329`

**Description:** Same as SEC-3. The raw API key dialog stays open until the user clicks "Done". Best practice for sensitive credentials is to auto-dismiss after a timeout (e.g., 5 minutes) with a visible countdown.

**Concrete failure scenario:** Admin creates a key, is interrupted, walks away. Key remains visible on an unlocked screen.

**Fix:** Add a 5-minute auto-dismiss timer with a visible countdown indicator.

**Confidence:** Medium (security/UX best practice)

---

### DES-3: Chat widget "isInContestContext" hides widget on contest list page — UX friction [LOW/LOW]

**File:** `src/lib/plugins/chat-widget/chat-widget.tsx:61-65`

**Description:** Same as CRI-3. The widget hides on any URL containing `/contests/`, including the contest list page where the user is not in an active contest. Students lose access to the AI assistant while browsing their contest list.

**Fix:** Only hide the widget when actively participating in a timed/anti-cheat-enabled assignment, not when browsing the contest list.

**Confidence:** Low (UX preference)

---

## Previously Deferred Items (Still Present)

- Console.error in client components (deferred)
