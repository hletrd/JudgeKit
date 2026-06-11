# Debugger Pass — RPF Cycle 3/100

**Date:** 2026-04-27
**Lane:** debugger
**Scope:** Latent bug surface, failure modes, regressions

## Summary

The cycle-2 commits did not introduce regressions in the surfaces I checked (analytics, anti-cheat, proxy cookie clearing). All known cycle-1/2 latent bugs were patched. The remaining failure-mode surface is small and primarily theoretical.

## Findings

### DBG3-1: [MEDIUM] Background analytics refresh: `_refreshingKeys.delete(cacheKey)` happens in `finally` but the LRU `analyticsCache.set` happens in `try` — bug if `set` throws

**File:** `src/app/api/v1/contests/[assignmentId]/analytics/route.ts:46-57`
**Confidence:** MEDIUM

In `refreshAnalyticsCacheInBackground`:
```ts
try {
  const fresh = await computeContestAnalytics(assignmentId, true);
  analyticsCache.set(cacheKey, { data: fresh, createdAt: await getDbNowMs() });
  _lastRefreshFailureAt.delete(cacheKey);
} catch (err) {
  _lastRefreshFailureAt.set(cacheKey, Date.now());
  logger.error(...);
} finally {
  _refreshingKeys.delete(cacheKey);
}
```

If `analyticsCache.set` throws (LRU implementation could in theory throw — e.g., if max=0 or an invariant breaks), control transfers to `catch`. There, we set `_lastRefreshFailureAt`, then `finally` runs, releasing `_refreshingKeys`. So the immediate state is: the original cached entry is still present (or was evicted by the LRU max=100 invariant), `_lastRefreshFailureAt` is set, `_refreshingKeys` is cleared. The next request gets the (stale or evicted) entry, observes the cooldown, and skips refresh for 5s. Functionally fine.

But: `await getDbNowMs()` between `analyticsCache.set` and `_lastRefreshFailureAt.delete` is the actual race window. If it throws, `analyticsCache` was just updated with the fresh data — but `_lastRefreshFailureAt` (if it had a previous failure) is NOT cleared. Next request: cache hit, fresh, returns the data; the cooldown is moot because no refresh is scheduled (cache is fresh). Eventually the entry goes stale and the cooldown's residual entry blocks refresh for 5s. Acceptable.

Also: `getDbNowMs()` is awaited as the *value* for `createdAt`, so it's evaluated before `analyticsCache.set` is called. If `getDbNowMs()` throws, `analyticsCache.set` doesn't run, and we fall through to `catch` setting cooldown. That's the documented behavior.

**Net:** No bug under realistic LRU + DB conditions. The robustness comes from `finally` releasing the in-flight flag. Documenting this in a one-line comment would help future debuggers.

**Fix:** Defer (no current bug). Optionally add a one-line comment to `refreshAnalyticsCacheInBackground` explaining the order: `getDbNowMs()` is awaited *before* `analyticsCache.set` so the cache write is atomic-ish.

---

### DBG3-2: [LOW] Test "respects cooldown" advances clock by 1 second after the first refresh fails — but `Date.now()` is mocked, and the cooldown read uses `Date.now() - lastFailure < REFRESH_FAILURE_COOLDOWN_MS`

**File:** `tests/unit/api/contests-analytics-route.test.ts:201-224`
**Confidence:** MEDIUM

The test:
1. Sets system time to `12:00:00`.
2. Primes cache.
3. Sets system time to `12:00:31` (cache stale).
4. Compute throws; cooldown is set with `Date.now() = 12:00:31` time.
5. Sets system time to `12:00:32` (1s after failure).
6. Expects no refresh.

The route reads `nowMs - lastFailure >= REFRESH_FAILURE_COOLDOWN_MS` at line 98 (`5_000` ms). `nowMs - lastFailure = 1000` ms — less than 5000, so cooldown is active and the `if (...)` fails ⇒ no refresh. Correct.

**Fix:** Defer. Optionally add a one-line comment to the test explaining how `vi.runAllTimersAsync()` drains microtasks for the detached `.catch` chain.

---

### DBG3-3: [LOW] Anti-cheat retry timer can clear via cleanup but the `scheduleRetryRef.current` closure is set in a separate `useEffect` from the listener registration

**File:** `src/components/exam/anti-cheat-monitor.tsx:142-155, 223-303`
**Confidence:** LOW

The `scheduleRetryRef.current` is reassigned in the effect at line 142, depending on `[performFlush]`. The listener-registration effect at line 223 depends on `[enabled, resolvedWarningMessage, showPrivacyNotice]`.

If `performFlush` changes (e.g., `assignmentId` changes — though the component is keyed on it, so this doesn't happen in current code), `scheduleRetryRef.current` is updated. But the cleanup of the listener-registration effect runs only on its own dep change, so the retry timer is cleared on re-mount via line 298, not on `performFlush` change.

This is fine because the timer body itself reads `scheduleRetryRef.current` (always the latest), so even an in-flight timer call uses the new closure correctly.

**Net:** No bug. Slightly intricate; the cycle-2 doc comment at lines 138–141 documents that `scheduleRetryRef.current = (remaining) => ...` is the "single source of truth for retry scheduling logic". OK.

**Fix:** No change.

---

### DBG3-4: [LOW] `getAuthSessionCookieNames` factory has no test for the literal cookie-name values

**File:** `tests/unit/security/env.test.ts`, `src/lib/security/env.ts:178-180`
**Confidence:** LOW

The cycle-2 test covers the return shape `{ name, secureName }` but doesn't independently cover the names being the documented constants `authjs.session-token` and `__Secure-authjs.session-token`. If a future change accidentally swaps the two, the proxy would clear the wrong cookie.

**Fix:** Add a snapshot-style test asserting the literal string values:
```ts
expect(getAuthSessionCookieNames()).toEqual({
  name: "authjs.session-token",
  secureName: "__Secure-authjs.session-token",
});
```
LOW priority; pick up if cycle 3 has slack.

## Verification Notes

- `npm run test:unit` (analytics file): 7/7 pass.
- `npm run lint`: 0 errors.
- Verified `git log` shows the cycle-2 commits are all correctly conventional + gitmoji formatted.
- Verified `git show <hash>` for each cycle-2 commit (`1c25cbed`, `214b8591`, `e897b0a5`, `362200f3`, `df72d773`, `a68b31c0`) shows expected scope (no leakage outside the documented surface).

## Confidence

- MEDIUM: DBG3-1 (theoretical), DBG3-2 (test pattern documented).
- LOW: DBG3-3, DBG3-4.

No HIGH-severity findings. The cycle-3 actionable item is DBG3-4 (lightweight test addition); the rest are deferred.
