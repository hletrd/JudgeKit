# Comprehensive Review — Cycle 46

**Reviewer:** comprehensive-reviewer (single-agent deep review)
**Date:** 2026-05-10
**Scope:** Full repository — Next.js app, API routes, components, hooks, lib modules
**Focus:** Timer/resource leaks, race conditions, error handling, React lifecycle issues

---

## C46-1: [LOW] Timer leak in `callWorkerJson`/`callWorkerNoContent` when custom signal provided

**Confidence:** HIGH
**Files:** `src/lib/docker/client.ts:118`, `src/lib/docker/client.ts:152`

`callWorkerJson` and `callWorkerNoContent` both accept an optional `init?: RequestInit` parameter. When `init.signal` is provided, they wrap it with `withTimeout(init.signal, 30_000)` (or 60_000 for `callWorkerNoContent`) before passing to `fetch()`. However, unlike `apiFetch` in `src/lib/api/client.ts` (which was fixed in cycle 45), neither function calls `cleanupWithTimeout()` after `fetch()` completes.

**Concrete failure scenario:** A future caller (or existing external integration) passes an `AbortSignal` to `buildDockerImage()` or `removeDockerImage()` with a long-running timeout. The `withTimeout` creates a 30s timer. If the Docker worker responds in 2s, the timer fires 28s later with no work to do. Under sustained load with custom signals, these dangling timers accumulate.

**Fix:** Chain `.finally(() => cleanupWithTimeout(signal))` on the `fetch()` call when a custom signal was provided, mirroring the fix in `apiFetch`.

---

## C46-2: [LOW] `useVisibilityPolling` breaks permanently if callback throws

**Confidence:** MEDIUM
**File:** `src/hooks/use-visibility-polling.ts:57-61`

The `scheduleNext()` function inside `useVisibilityPolling` is:
```ts
timerId = setTimeout(() => {
  if (cancelled) return;
  tick();
  scheduleNext();
}, intervalMs);
```

`tick()` calls `savedCallback.current()` synchronously. If the user's callback throws an exception, the exception propagates out of the `setTimeout` callback without reaching `scheduleNext()`. The timer is never rescheduled, and polling stops permanently for the lifetime of the component (or until the effect re-runs due to dependency changes).

The hook's doc comment says "The callback must handle its own errors", but in practice React component callbacks can throw from unexpected places (e.g., a `setState` updater that throws, or a downstream component error). Once broken, the hook provides no recovery mechanism.

**Concrete failure scenario:** A dashboard component uses `useVisibilityPolling` to refresh data every 30s. A transient `setState` error during one refresh tick causes an unhandled exception. The exception is caught by an error boundary, but polling never resumes. The user sees stale data indefinitely until they manually refresh the page.

**Fix:** Wrap `tick()` in a try/catch inside `scheduleNext()` so that even if the callback throws, `scheduleNext()` is still called and polling continues.

---

## Final Sweep: Commonly Missed Issues

- **Timer leaks in components:** All examined components (anti-cheat-monitor, countdown-timer, submission-list-auto-refresh, problem-submission-form, recruiting-invitations-panel, lecture-toolbar, api-keys-client, file-management-client) properly clean up timers in useEffect cleanup functions. No additional leaks found.
- **AbortSignal cleanup:** `apiFetch` correctly cleans up `withTimeout` signals (cycle 45 fix verified). The Docker client functions are the only remaining place with this pattern unchecked.
- **SSE cleanup:** The shared poll timer and cleanup timer in `events/route.ts` both have proper `stopSseCleanupTimer()` exports and `unref()` calls.
- **Audit flush:** `stopAuditFlushTimer()` exported correctly (cycle 43 fix verified).
- **Rate limit eviction:** `stopRateLimitEviction()` exported and used in tests.
- **Data retention pruning:** `stopSensitiveDataPruning()` properly clears both local and global timer references.
- **Type safety:** No unsafe `as` casts found in newly reviewed code that bypass validation.
- **SQL injection:** All raw queries use parameterized bindings via `namedToPositional`. No user input reaches SQL unsanitized.
- **Auth bypass:** All examined API routes use `createApiHandler` with appropriate auth config. No missing auth checks found.
