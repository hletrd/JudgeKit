# Debugger — RPF Cycle 5/100

**Date:** 2026-04-26
**Lens:** latent bug surface, failure modes, regressions, defensive code review

---

## DBG5-1: [LOW, actionable, NEW] `_refreshingKeys.add` runs OUTSIDE `refreshAnalyticsCacheInBackground` — paired with the function's `finally` cleanup, but coupling is fragile

**Severity:** LOW
**Confidence:** HIGH

**Evidence:** `src/app/api/v1/contests/[assignmentId]/analytics/route.ts:159-170`
```ts
if (!_refreshingKeys.has(cacheKey) && nowMs - lastFailure >= REFRESH_FAILURE_COOLDOWN_MS) {
  _refreshingKeys.add(cacheKey);             // ← line 160
  refreshAnalyticsCacheInBackground(assignmentId, cacheKey).catch((err) => {...});
}
```
Then `refreshAnalyticsCacheInBackground.finally` (line 84-86) does `_refreshingKeys.delete(cacheKey)`.

**Why it's a problem:** The add-here / delete-there pattern means `_refreshingKeys` consistency depends on the function ALWAYS running its `finally`. If a future refactor:
- replaces the `.catch` chain with try/await wrapping that throws synchronously, OR
- moves `refreshAnalyticsCacheInBackground` to a different file and someone "simplifies" by removing the `finally`,

the set leaks the key. Subsequent stale-cache reads see `_refreshingKeys.has(cacheKey) === true` and never trigger refresh. This is a slow degradation that only surfaces under "stale cache after a refresh attempt" — easy to miss in tests.

**Fix:** Co-locate add and delete inside the function:
```ts
async function refreshAnalyticsCacheInBackground(assignmentId, cacheKey) {
  if (_refreshingKeys.has(cacheKey)) return;  // (idempotent guard)
  _refreshingKeys.add(cacheKey);
  try { ... } catch { ... } finally { _refreshingKeys.delete(cacheKey); }
}
```
Caller becomes:
```ts
if (nowMs - lastFailure >= REFRESH_FAILURE_COOLDOWN_MS) {
  refreshAnalyticsCacheInBackground(assignmentId, cacheKey).catch(...);
}
```
This co-locates the lifecycle in one function. The duplicate-check guard in caller becomes optional but defense-in-depth.

**Exit criteria:**
- Single owner for `_refreshingKeys` add+delete (the function itself).
- Existing test "triggers exactly one background refresh" still passes (the in-function guard preserves the dedup invariant).
- All gates green.

---

## DBG5-2: [LOW, NEW] `formatEventTime` accepts `string | number` but a number is treated as Unix-seconds (line 297-299) — silent type confusion

**Severity:** LOW
**Confidence:** MEDIUM

**Evidence:** `src/components/contest/anti-cheat-dashboard.tsx:296-300`
```ts
function formatEventTime(ts: string | number): string {
  const d = typeof ts === "number" ? new Date(ts * 1000) : new Date(ts);
  ...
}
```
The function multiplies by 1000 when `ts` is a number, assuming Unix-seconds. But callers pass `event.createdAt` (line 571), and `createdAt` is typed `string` in the `AntiCheatEvent` interface (line 49). The number branch is unreachable from current call sites.

**Why it's a problem:** The unused number branch (a) suggests the code once handled both, (b) creates a foot-gun if a future contributor passes `Date.now()` thinking it's seconds — they'll get year ~57000.

**Fix:** Either narrow the type to `string` (delete the unused branch) or make the contract explicit (`tsSeconds: number`).

**Exit criteria:** Either the number branch handles all common cases (ms-vs-seconds detection) or it's deleted entirely.

---

## DBG5-3: [LOW, NEW] `lastEventRef.current[eventType] ?? 0` — initial render, every event passes the throttle

**Severity:** LOW
**Confidence:** MEDIUM

**Evidence:** `src/components/exam/anti-cheat-monitor.tsx:127-130`
```ts
const lastEventAt = lastEventRef.current[eventType] ?? 0;
if (now - lastEventAt < MIN_INTERVAL_MS) return;
lastEventRef.current[eventType] = now;
```
First-time event for any `eventType`: `lastEventAt = 0`, `now - 0 >= MIN_INTERVAL_MS` → passes. Correct intent.

**Why it's a near-bug:** If a contest starts and the user immediately switches tabs, blurs, copies, and contextmenu's all within 1ms, ALL FOUR events are recorded (since each has a different key, no throttle). The intent of `MIN_INTERVAL_MS` is per-event-type throttling — that part is correct. But there's no global rate-limit on the burst of distinct event types. A bot could fire one of every event type per second, generating 6 events/sec sustained.

**Why deferring:** Not a regression; intentional behavior. The server-side rate-limit (`anti-cheat:log` in `route.ts:35`) is the actual throttle.

**Exit criterion for re-open:** Server-side rate-limit becomes a load problem.

---

## Final Sweep

- The cycle-4 fixes (gate `__test_internals`, cap `loadPendingEvents`, defensive comment in catch) all observed working in the test suite.
- The dispose-hook test in `contests-analytics-route.test.ts:230-248` actually covers the cooldown-eviction invariant — robust.
- All gates green: lint 0 errors, test:unit 2232 pass, build EXIT=0.
