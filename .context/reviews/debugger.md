# Debugger Pass — RPF Cycle 2/100

**Date:** 2026-04-26
**Lane:** debugger
**Scope:** Latent bugs, failure modes, regressions

## Findings

### DBG2-1: [HIGH] Production source changes uncommitted; running tests at HEAD fails
**File:** `src/proxy.ts`, `src/lib/security/env.ts`
**Confidence:** HIGH

Same root cause as VER2-1. Failure mode: a clean checkout of HEAD followed by `npm run test:unit` would fail in `tests/unit/security/env.test.ts` because `getAuthSessionCookieNames` is not defined on the real export at HEAD. Working tree masks the bug.

### DBG2-2: [MEDIUM] Analytics IIFE has 4-deep nested error handling on the failure path
**File:** `src/app/api/v1/contests/[assignmentId]/analytics/route.ts:76-99`
**Confidence:** HIGH

Nesting:
```
async () => {
  try {
    ... computeContestAnalytics
    ... getDbNowMs
  } catch {
    try {
      ... getDbNowMs
    } catch {
      ... Date.now()
    }
    logger.error(...)
  } finally { ... }
}.catch(() => {})
```

That's 4 catches in one function. If ANY of them have a side effect (logger.error throws? unlikely but possible during process shutdown when the logger transport closes) the failure propagates up but is silently swallowed by `.catch(() => {})`. Debugging a real failure here is hard because every layer eats errors.

**Fix:** 
1. Extract to a named function `refreshAnalyticsCacheInBackground(assignmentId, cacheKey)`.
2. Replace the outer `.catch(() => {})` with `.catch((err) => logger.warn({ err, assignmentId }, "[analytics] background refresh swallowed"))`.
3. Replace the inner cooldown-set try/catch with a single `Date.now()` write per PERF2-1.

### DBG2-3: [LOW] Anti-cheat `online` event handler doesn't clear retryTimerRef before flushing
**File:** `src/components/exam/anti-cheat-monitor.tsx:276-278`
**Confidence:** LOW

When the user goes online, `flushPendingEventsRef.current()` runs immediately. But if a retry timer is already scheduled, the flush and the timer can race — both attempting to send the same events. Result: duplicate POSTs to `/api/v1/contests/{id}/anti-cheat`.

`performFlush` reloads from localStorage and saves remaining, so concurrency on localStorage is the risk: two flushes can race, second loads the same pending list, double-send. Server should be idempotent, but client wastes a request.

**Fix:** Cancel `retryTimerRef.current` at the start of `flushPendingEventsRef.current()` to ensure only one retry path runs. Or use a `flushInProgress` ref to skip overlapping calls.

### DBG2-4: [LOW] `_refreshingKeys.delete` in finally fires even when DB is unhealthy — could mask sustained failure
**File:** `src/app/api/v1/contests/[assignmentId]/analytics/route.ts:93-95`
**Confidence:** MEDIUM

The finally clears `_refreshingKeys.delete(cacheKey)` so the next stale read can trigger another background refresh. The cooldown (`_lastRefreshFailureAt`) is the gate that prevents thundering herd, BUT the cooldown is only 5s. If DB is dead for 30s, every 5s a fresh refresh attempt fires, takes some time to fail, completes, releases the in-progress flag, and the next stale read kicks off another. With many cache keys (across many contests), DB amplification can be significant.

**Fix:** Increase cooldown to backoff exponentially after consecutive failures. Defer — current load level probably tolerable.

## Verification Notes

- DBG-3 from cycle 1 (initial no-op never fires) — still safe; useEffect wires the real handler synchronously after first render.
- DBG-5 from cycle 1 (localStorage keyed by assignmentId) — verified, no cross-contest leakage.

## Confidence

DBG2-1 HIGH. DBG2-2 HIGH (4-deep nesting verified by line count). Others MEDIUM/LOW.
