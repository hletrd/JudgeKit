# RPF Cycle 35 — Designer Review

**Date:** 2026-04-23
**Base commit:** 218a1a93

## DES-1: Chat widget textarea lacks explicit aria-label [LOW/LOW — carry-over from prior cycle]

**File:** `src/lib/plugins/chat-widget/chat-widget.tsx:363-377`

**Description:** The textarea uses `placeholder` for its accessible name but does not have an explicit `aria-label`. WCAG 2.2 requires that form inputs have a programmatically associated label. Placeholder text is not a substitute for a label — it disappears when the user starts typing, and some assistive technologies do not announce placeholder text. This was deferred in prior cycles.

**Note:** This is a carry-over finding, not new. Maintaining in this review for completeness.

**Confidence:** LOW (placeholder provides fallback, no user complaints)

---

## DES-2: Chat widget scrollToBottom uses isStreaming state instead of ref [LOW/LOW]

**File:** `src/lib/plugins/chat-widget/chat-widget.tsx:87-105`

**Description:** The `scrollToBottom` callback switches between rAF-batched and smooth scrolling based on `isStreaming`. Since `isStreaming` is in the dependency array, the callback is recreated on streaming state changes, causing the scroll effect to re-subscribe. This can cause a brief visual glitch where the scroll position doesn't track during the re-subscription gap. Using `isStreamingRef.current` (as already done for `sendMessage`) would eliminate this.

**Fix:** Use `isStreamingRef.current` inside `scrollToBottom` and remove `isStreaming` from the dependency array.

**Confidence:** LOW

---

## DES-3: Reduced motion: chat widget entry animation already covered by globals.css [PASS — verified]

**File:** `src/app/globals.css:138-145`

**Description:** Verified that the globals.css `@media (prefers-reduced-motion: reduce)` rule already forces `animation-duration: 0.01ms !important` for all elements. The chat widget entry animation (`animate-in fade-in slide-in-from-bottom-4 duration-200`) is correctly suppressed when reduced motion is preferred.

**Confidence:** HIGH
