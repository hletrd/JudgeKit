# Performance Review — RPF Cycle 25

**Date:** 2026-04-22
**Base commit:** ac51baaa

## PERF-1: `submission-overview.tsx` polls when dialog is closed -- properly guarded now [RESOLVED]

**File:** `src/components/lecture/submission-overview.tsx:131`

```ts
useVisibilityPolling(() => { void fetchStats(); }, POLL_INTERVAL_MS, !open);
```

The `paused` parameter is `!open`, so polling stops when the dialog is closed. The `fetchStats` also has a `if (!openRef.current) return;` guard. This double-guard is correct and prevents unnecessary fetches. The previous finding (DEFER-41 / PERF-5) appears to be properly addressed now -- the `paused` flag stops the interval entirely.

**Status:** Re-evaluated -- properly guarded. No action needed. Removing from deferred items.

---

## PERF-2: `contest-quick-stats.tsx` double-wraps `Number()` -- unnecessary coercion overhead [LOW/LOW]

**File:** `src/components/contest/contest-quick-stats.tsx:65-68`

The `Number()` calls on already-numeric JSON-parsed values are no-ops. Not a real performance concern but adds unnecessary function call overhead in a hot polling path.

**Fix:** Use `typeof x === "number"` checks instead of `Number.isFinite(Number(x))`.

---

## PERF-3: `active-timed-assignment-sidebar-panel.tsx` continues setInterval after all assignments expire [LOW/LOW]

**File:** `src/components/layout/active-timed-assignment-sidebar-panel.tsx:69-73`

The effect does check `allExpired` and calls `clearInterval`, but it has a timing gap: the interval fires every 1000ms, but the `setNowMs(now)` call always happens before the expiry check. This means one extra tick after expiry where the component re-renders with the expired time before the interval is cleared. Not a real performance issue -- just a minor inefficiency.

**Fix:** Check expiry before `setNowMs` to avoid the unnecessary re-render. Very low priority.

---

## PERF-4: Recruiting invitations panel re-fetches stats on every filter change [MEDIUM/LOW]

**File:** `src/components/contest/recruiting-invitations-panel.tsx:166-168`

```ts
const fetchData = useCallback(async () => {
  await Promise.all([fetchInvitations(), fetchStats()]);
}, [fetchInvitations, fetchStats]);
```

Each time `debouncedSearch` or `statusFilter` changes, `fetchInvitations` is re-created and `fetchData` fires, which also calls `fetchStats`. The stats fetch is independent of search/filter but gets re-triggered on every filter change because `fetchData` combines both.

**Fix:** Separate the stats fetch so it only runs on mount and after mutations, not on every filter change.

---

## PERF-5: `contest-replay.tsx` uses `useLayoutEffect` for FLIP animation -- runs synchronously [LOW/LOW]

**File:** `src/components/contest/contest-replay.tsx:95-130`

The `useLayoutEffect` runs synchronously after every render when `selectedSnapshot` changes. For a replay with many entries, this forces the browser to do layout calculations synchronously. Not a real performance concern for the typical use case (5-50 participants), but could jank on large contests.

**Fix:** Consider using `requestAnimationFrame` batching for the FLIP animations. Low priority.
