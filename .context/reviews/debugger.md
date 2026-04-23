# Debugger Review — RPF Cycle 18

**Date:** 2026-04-22
**Reviewer:** debugger
**Base commit:** d32f2517

## DBG-1: `participant-anti-cheat-timeline.tsx` polling replaces first page but may duplicate events if `loadMore` was used [MEDIUM/MEDIUM]

**File:** `src/components/contest/participant-anti-cheat-timeline.tsx:96-114`
**Confidence:** MEDIUM

When polling refreshes the first page of events, the code preserves events beyond `PAGE_SIZE` (from `loadMore`). However, if the total number of events increases between polls, the boundary between the first page and subsequent pages may overlap. The code assumes events at indices `0..PAGE_SIZE-1` come from the fresh fetch, and `PAGE_SIZE..end` from previous `loadMore` calls. If new events were added server-side that shift the offset boundary, the displayed events could have duplicates at the boundary.

**Concrete failure:** If 5 new anti-cheat events are created between polls and the user has previously loaded 2 pages (100 events), the refreshed first 50 events will overlap with the previous first 50 events that are now at offset positions 55-104 on the server. The `slice(PAGE_SIZE)` preserves stale events 51-100, but these are now actually events 56-105 on the server.

**Fix:** When polling, reset the full event list to just the first page instead of trying to preserve loaded-more pages. Alternatively, track event IDs and deduplicate.

---

## DBG-2: `active-timed-assignment-sidebar-panel.tsx` timer doesn't account for clock drift in background tabs [LOW/LOW]

**File:** `src/components/layout/active-timed-assignment-sidebar-panel.tsx:72-84`
**Confidence:** LOW

Unlike `countdown-timer.tsx` which recalculates on `visibilitychange`, the sidebar timer uses a simple `setInterval` without visibility awareness. When a user switches tabs and comes back, the timer may have drifted because browsers throttle `setInterval` in background tabs.

**Concrete failure:** User switches tabs for 5 minutes, comes back, and the sidebar timer shows a stale value until it catches up on the next tick. Low severity because the timer auto-corrects within 1 second of returning.

**Fix:** Add a `visibilitychange` listener to immediately recalculate `nowMs` when the tab becomes visible, similar to `countdown-timer.tsx`.

---

## DBG-3: `quick-create-contest-form.tsx` error path silently succeeds — no error feedback on `res.json()` failure [LOW/MEDIUM]

**File:** `src/components/contest/quick-create-contest-form.tsx:80-81`
**Confidence:** MEDIUM

After a successful `res.ok`, the code calls `res.json().catch(() => ({ data: {} }))`. If the JSON parse fails on a success response (unlikely but possible if the server returns malformed JSON), the code falls through to `json.data?.assignmentId` which is undefined. The user sees a "createSuccess" toast but is NOT redirected to the contest page.

**Fix:** If `json.data?.assignmentId` is falsy on a success response, show an error toast or fall back to navigating to the contests list.

---

## Verified Safe

- All `res.json()` calls have `.catch()` guards
- No unguarded `innerHTML` assignments
- `apiFetchJson` safely handles both ok and non-ok responses
- Anti-cheat monitor properly uses refs for stable event handlers
- Countdown timer validates `Number.isFinite(data.timestamp)` before using
