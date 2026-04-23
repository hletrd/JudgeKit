# RPF Cycle 1 — Tracer

**Date:** 2026-04-22
**Base commit:** b1271d6a
**Reviewer:** tracer

## Inventory of Reviewed Files

- `src/components/contest/contest-quick-stats.tsx` (working tree)
- `src/components/submission-list-auto-refresh.tsx` (working tree)
- `src/app/api/v1/contests/[assignmentId]/stats/route.ts`
- `src/hooks/use-visibility-polling.ts`
- `src/components/exam/anti-cheat-monitor.tsx`

## Traced Flows

### Flow 1: Contest quick-stats polling cycle (working tree)

1. Component mounts -> `useVisibilityPolling` effect runs -> `syncVisibility()` -> `tick()` -> `fetchStats()`
2. `fetchStats()` -> `apiFetch(/api/v1/contests/${assignmentId}/stats)` -> response -> `setStats()`
3. `syncVisibility()` -> `setInterval(tick, 15000)`
4. Tab switches away -> `visibilitychange` fires -> `clearPollingInterval()`
5. Tab switches back -> `visibilitychange` fires -> `tick()` + new `setInterval()`
6. If fetch fails on initial load -> toast.error. If fails on poll -> silent.

**Tracing verdict:** Flow is correct. The `initialLoadDoneRef` correctly suppresses polling-error toasts.

### Flow 2: SubmissionListAutoRefresh tick scheduling (working tree)

1. Effect runs -> `void start()` -> `await tick()` -> `scheduleNext()`
2. `tick()`: check `isRunningRef` -> set true -> check visibility -> `apiFetch(/api/v1/time)` -> if ok, `router.refresh()` -> reset errorCount -> set false in finally
3. `scheduleNext()`: `setTimeout(async () => { await tick(); scheduleNext(); }, getBackoffInterval())`
4. If tick fails: errorCountRef++ -> next interval multiplied

**Tracing verdict:** The `isRunningRef` guard prevents concurrent ticks. The `async start()` pattern ensures the initial tick completes before scheduling. The backoff is correct. One subtlety: the `visibilityState === "hidden"` check returns early from tick, but `isRunningRef` is reset in `finally`, so the guard is properly maintained.

### Flow 3: Stats API PostgreSQL numeric type serialization

1. SQL `ROUND(AVG(ut.total_score), 1)` returns PostgreSQL `numeric` type
2. Node.js pg driver serializes `numeric` as string by default (not number)
3. JSON response: `{ data: { avgScore: "85.5" } }` (string, not number)
4. Frontend: `typeof json.data.avgScore === "number"` -> false -> falls back to `prev.avgScore`
5. avgScore never updates from initial 0

**Tracing verdict:** This is a potential bug. The `::float` cast is needed in SQL, or `Number()` conversion is needed on the frontend.

## Findings

### TR-1: Stats API `avgScore` may serialize as string due to PostgreSQL `numeric` type [MEDIUM/MEDIUM]

**File:** `src/app/api/v1/contests/[assignmentId]/stats/route.ts:91`

**Description:** PostgreSQL `ROUND()` returns `numeric` type, which the pg driver serializes as a string. The frontend `typeof === "number"` check would fail, causing avgScore to never update.

**Fix:** Add `::float` cast in SQL: `COALESCE(ROUND(AVG(ut.total_score), 1), 0)::float`.

**Confidence:** Medium — depends on pg driver configuration.

### TR-2: `useVisibilityPolling` fires all callbacks simultaneously on tab switch [MEDIUM/MEDIUM]

**File:** `src/hooks/use-visibility-polling.ts:40-44`

**Description:** When the tab becomes visible, all 4 consumers fire their callbacks at the same instant. This creates a request burst.

**Fix:** Add random jitter (0-500ms) to the initial tick.

## Summary

| ID | Severity | Confidence | Description |
|----|----------|------------|-------------|
| TR-1 | MEDIUM | MEDIUM | Stats API avgScore may serialize as string from PG numeric type |
| TR-2 | MEDIUM | MEDIUM | Visibility polling fires all callbacks simultaneously |
