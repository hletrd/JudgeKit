# Performance Review — RPF Cycle 15

**Date:** 2026-04-22
**Reviewer:** perf-reviewer
**Base commit:** 6c07a08d

## Previously Fixed Items (Verified)

All cycle 14 performance findings remain addressed:
- PERF-2 (problem-import-button file size validation): Fixed — 10MB limit added

## Findings

### PERF-1: Anti-cheat dashboard polling replaces all data on every tick — carried from PERF-1 (cycle 13) [MEDIUM/LOW]

**File:** `src/components/contest/anti-cheat-dashboard.tsx:120-152`

**Description:** Carried from cycle 13. The `fetchEvents` callback replaces the entire first-page events slice on every 30-second polling tick. While the code preserves extra-page data via `prev.slice(PAGE_SIZE)`, the first page is always recreated, causing unnecessary React re-renders even when the data is identical.

The `setEvents` updater on line 128 always creates a new array: `[...firstPage, ...prev.slice(PAGE_SIZE)]`. React's state setter does not do a shallow comparison, so even if `firstPage` has identical content, a new reference triggers a re-render of the entire table.

**Fix:** Add shallow comparison before calling `setEvents()`:
```ts
setEvents((prev) => {
  if (prev.length > PAGE_SIZE) {
    const merged = [...firstPage, ...prev.slice(PAGE_SIZE)];
    // Only update if first page actually changed
    if (prev.slice(0, PAGE_SIZE).every((e, i) => e.id === firstPage[i]?.id)) return prev;
    return merged;
  }
  // Compare by id for simple case
  if (prev.length === firstPage.length && prev.every((e, i) => e.id === firstPage[i]?.id)) return prev;
  return firstPage;
});
```

**Confidence:** MEDIUM

---

### PERF-2: `recruiting-invitations-panel.tsx` fetches invitations and stats sequentially via `Promise.all` but stats fetch is best-effort — could skip on failure [LOW/LOW]

**File:** `src/components/contest/recruiting-invitations-panel.tsx:160-162`

**Description:** The `fetchData` function uses `Promise.all([fetchInvitations(), fetchStats()])`. The `fetchStats` function already swallows errors (empty catch on line 155-157). If the stats endpoint is slow, it blocks the invitations data from being processed even though invitations data is independent.

**Fix:** Use `Promise.allSettled` or fire stats fetch separately so invitations data renders immediately regardless of stats latency.

**Confidence:** LOW

---

### PERF-3: `contest-join-client.tsx` uses 1-second `setTimeout` delay before navigation — carried from PERF-3 (cycle 14) [LOW/LOW]

**File:** `src/app/(dashboard)/dashboard/contests/join/contest-join-client.tsx:57`

**Description:** Carried from cycle 14. The 1-second artificial delay adds perceived latency.

**Fix:** Reduce to 500ms or use `startTransition` for navigation.

**Confidence:** LOW

---

## Final Sweep

The anti-cheat dashboard polling re-render issue (PERF-1) remains the most significant performance concern, carried since cycle 13. The `apiFetchJson` refactor in cycle 14 eliminated the exception overhead from unguarded `res.json()` calls in 4 components. The 4 remaining unguarded `.json()` calls (identified in code-reviewer CR-1) have the same exception-overhead concern but are lower priority since they are on success paths after `res.ok` checks.
