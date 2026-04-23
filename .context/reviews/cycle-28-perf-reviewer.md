# Cycle 28 Performance Review

**Date:** 2026-04-20
**Reviewer:** perf-reviewer
**Base commit:** d4489054

## Findings

### PERF-1: `contest-announcements.tsx` and `contest-clarifications.tsx` interval leak on rapid visibility toggling [LOW/MEDIUM]

**Files:**
- `src/components/contest/contest-announcements.tsx:71-95`
- `src/components/contest/contest-clarifications.tsx:87-111`

**Problem:** The `syncVisibility` function creates a new interval when the page becomes visible but only clears it when the page becomes hidden. If `syncVisibility` is called rapidly (e.g., multiple visibility changes within a single event loop tick), there is a brief window where `interval` could be overwritten without the previous one being cleared. Specifically, if `syncVisibility` runs while `visible` and `interval` is already set, it does nothing — but if it runs while `hidden` and then immediately `visible` again before the cleanup, the old interval reference is lost.

In practice, `visibilitychange` events are throttled by the browser and this race is extremely unlikely. However, the pattern is fragile and could be improved by always clearing the previous interval before creating a new one.

**Concrete failure scenario:** Extremely unlikely — would require a browser that fires two visibility changes within microseconds. The actual impact would be a single extra API call per interval cycle.
**Fix:** Clear any existing interval before creating a new one: `if (interval) { clearInterval(interval); interval = null; }` before the `setInterval` call.

### PERF-2: `compiler-client.tsx` localStorage write on every language change without debounce [LOW/LOW]

**File:** `src/components/code/compiler-client.tsx:182-184`
**Problem:** `localStorage.setItem("compiler:language", language)` is called in a useEffect on every language change. This is a synchronous, blocking operation. While localStorage writes are typically fast (<1ms), they can cause micro-stutters on low-end devices if called in rapid succession (e.g., a user rapidly cycling through languages in the selector).

**Concrete failure scenario:** User rapidly changes language 10 times in 2 seconds, each change triggers a synchronous localStorage write.
**Fix:** Low priority — could add a debounce, but the current behavior is acceptable given the low frequency of language changes in practice.

## Verified Safe / No Issue

- SSE submission polling properly falls back to fetch polling with exponential backoff.
- `use-source-draft.ts` properly debounces localStorage writes (500ms) and flushes on visibility change/pagehide.
- `use-submission-polling.ts` properly handles visibility changes and aborts in-flight requests on cleanup.
- `authUserCache` in proxy is properly sized (500 entries, 2-second TTL) with FIFO eviction.
- Docker container cleanup in `execute.ts` is properly fire-and-forget with `.catch(() => {})`.
- Code snapshot polling in `problem-submission-form.tsx` properly uses refs to avoid stale closures and adjusts polling frequency based on inactivity.
