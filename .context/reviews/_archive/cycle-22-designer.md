# Designer — Cycle 22 (Fresh)

**Date:** 2026-04-20
**Base commit:** e80d2746

## Findings

### DES-1: Workers page polling continues in backgrounded tabs -- battery and bandwidth waste [LOW/LOW]

**File:** `src/app/(dashboard)/dashboard/admin/workers/workers-client.tsx:244`
**Description:** The workers admin page polls every 10 seconds regardless of tab visibility. This wastes battery on mobile devices and bandwidth on slow connections. The `SubmissionListAutoRefresh` component already implements visibility checking as a best practice.
**Fix:** Add `document.visibilityState` check before making polling requests, or pause the interval when the tab is hidden.
**Confidence:** LOW

## Verified Safe

- Korean letter-spacing is properly handled throughout all components using locale-conditional tracking classes.
- Mobile menu has proper focus trap and keyboard navigation.
- PublicHeader has `focus-visible:ring-2` styles on navigation links and buttons.
- Mobile sign-out button meets WCAG 2.2 minimum touch target of 24px (though below the recommended 44px -- deferred from cycle 19).
- Progress bars have proper ARIA attributes (`role="progressbar"`, `aria-valuenow`, etc.).
- Skip-to-content link is present on all layouts.
- `sr-only` announcements for mobile menu state changes.
