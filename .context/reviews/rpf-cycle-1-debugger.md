# RPF Cycle 1 — Debugger

**Date:** 2026-04-22
**Base commit:** b1271d6a
**Reviewer:** debugger

## Inventory of Reviewed Files

- `src/components/submission-list-auto-refresh.tsx`
- `src/components/contest/contest-quick-stats.tsx`
- `src/components/exam/anti-cheat-monitor.tsx`
- `src/hooks/use-visibility-polling.ts`
- `src/app/api/v1/contests/[assignmentId]/stats/route.ts`

## Findings

### DBG-1: `SubmissionListAutoRefresh` — `start()` function awaits tick but void-start pattern leaves no error propagation [LOW/LOW]

**File:** `src/components/submission-list-auto-refresh.tsx:60-62,74`

**Description:** The `start()` function correctly awaits `tick()` before calling `scheduleNext()`. However, `void start()` on line 74 means any unhandled rejection from `start()` would be an unhandled promise rejection. In practice, `tick()` has a try/catch/finally that swallows errors, so this is safe. But if someone removes the catch block, the unhandled rejection would be silent.

**Fix:** No fix needed — current error handling in `tick()` is sufficient. Noting for awareness.

### DBG-2: `anti-cheat-monitor.tsx` — setInterval with void async callback [LOW/MEDIUM]

**File:** `src/components/exam/anti-cheat-monitor.tsx:144-148`

**Description:** The heartbeat uses `setInterval(() => { void reportEvent("heartbeat"); }, HEARTBEAT_INTERVAL_MS)`. If `reportEvent` takes longer than 30s, multiple invocations stack up. The `MIN_INTERVAL_MS` guard prevents rapid-fire within 1s but doesn't prevent concurrent in-flight requests.

**Fix:** Replace `setInterval` with recursive `setTimeout` after `reportEvent` resolves.

### DBG-3: Stats API route — `avgScore` uses `ROUND(AVG(...), 1)` which rounds in SQL [LOW/LOW]

**File:** `src/app/api/v1/contests/[assignmentId]/stats/route.ts:91`

**Description:** `COALESCE(ROUND(AVG(ut.total_score), 1), 0)` rounds to 1 decimal place in SQL. The frontend then passes this through `formatNumber` with `maximumFractionDigits: 1`. If the SQL rounding and the JS formatting rules ever diverge, the display would be inconsistent. Currently they're aligned.

**Fix:** No fix needed — currently aligned.

## Summary

| ID | Severity | Confidence | Description |
|----|----------|------------|-------------|
| DBG-2 | LOW | MEDIUM | Anti-cheat setInterval with async callback — stacking possible |
