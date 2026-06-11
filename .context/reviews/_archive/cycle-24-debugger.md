# Debugger — Cycle 24

**Date:** 2026-04-20
**Base commit:** f1b478bc

## Findings

### DBG-1: `ContestsLayout` stopPropagation breaks event delegation chains [MEDIUM/MEDIUM]

**Files:** `src/app/(dashboard)/dashboard/contests/layout.tsx:25`
**Description:** The click handler calls `me.stopPropagation()` on every intercepted internal link click. This breaks React's synthetic event delegation for any component that registers a click handler on an ancestor element. In React, events bubble through the virtual DOM via delegation on the root. If `stopPropagation()` is called in a capture-phase listener on a container element, it prevents the event from reaching any React onClick handlers registered on child elements.
**Concrete failure scenario:** A contest page has a button with an onClick handler inside an `<a>` tag (e.g., a delete button inside a link row). The layout's capture-phase listener intercepts the click, calls `stopPropagation()`, and the button's onClick never fires. The user is navigated away instead of seeing the expected action.
**Fix:** Remove `stopPropagation()` and rely only on `preventDefault()` to block the default link navigation. If the goal is to prevent other listeners, use a data attribute on the link to signal that it was intercepted, and check for that attribute in other handlers.
**Confidence:** MEDIUM

### DBG-2: Silent catch in `participant-anti-cheat-timeline.tsx` loadMore [LOW/MEDIUM]

**Files:** `src/components/contest/participant-anti-cheat-timeline.tsx:120-121`
**Description:** The `loadMore` function has `catch { // silently fail on load-more }`. While load-more failure is less critical than initial load failure, it still means the user may think they've seen all events when more exist. The initial `fetchEvents` correctly sets `setError(true)`, but `loadMore` does not.
**Concrete failure scenario:** An instructor viewing anti-cheat events clicks "Load More". The fetch fails silently. The instructor believes there are no more events, but 50+ additional events are hidden.
**Fix:** Show a toast error on load-more failure, or at minimum increment a retry counter.
**Confidence:** MEDIUM

## No Regression Found

- The `apiFetch` migration for `countdown-timer.tsx` (cycle 23) is working correctly.
- The leaderboard visibility-aware polling (cycle 23) is properly implemented with pause/resume.
- No new `console.log` calls in production source.
