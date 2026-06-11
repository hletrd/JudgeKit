# Comprehensive Review — Cycle 45

**Date:** 2026-05-10
**Reviewer:** comprehensive-reviewer (single-pass, no parallel fan-out due to agent tool unavailability)
**Total findings:** 2 new (both LOW) + 0 false positives + prior cycle findings confirmed fixed

---

## New Findings

### C45-1: [LOW] Timer leak in `withTimeout` when fetch completes before timeout expires

**Confidence:** HIGH

`src/lib/abort.ts:25-44` — The `withTimeout` function creates a `setTimeout` that fires after `ms` milliseconds to abort the combined controller. If the underlying `fetch()` completes successfully before the timeout, the timer is never cleaned up. Each call to `apiFetch` with a custom `AbortSignal` leaves a dangling timer for up to 30 seconds.

**Concrete failure scenario:** A dashboard component polls every 5 seconds via `apiFetch(url, { signal: abortController.signal })`. After 60 seconds of active polling, 12 timers are pending even though all fetches completed successfully. Under sustained high-frequency API calls (e.g., live contest leaderboard polling, SSE fallback polling), this accumulates. While each timer eventually fires and self-cleans, the pending timer count can grow large enough to show up in heap snapshots and process diagnostics.

**Fix:** Provide a cleanup mechanism for the timer when the fetch completes. Options:
1. Modify `withTimeout` to return a `[AbortSignal, cleanupFn]` tuple and update `apiFetch` to call cleanup in `.finally()`.
2. Use `AbortSignal.any()` + `AbortSignal.timeout()` when available (Node.js 20+, modern browsers) as a non-leaking native alternative, with the current implementation as fallback.

**Cross-reference:** This is a latent issue in a utility function used by all client-side API calls that pass a custom signal.

---

### C45-2: [LOW] Code snapshot timer race on component unmount

**Confidence:** MEDIUM

`src/components/problem/problem-submission-form.tsx:110-134` — The recursive `tick` function inside the code snapshot `useEffect` schedules the next timer via `setTimeout(tick, nextDelay)` after the `apiFetch` call. If the component unmounts while `tick` is executing (after `apiFetch` resolves but before `setTimeout` is called), the cleanup function has already run and the new timer ID is not cleared. The timer fires once on an unmounted component, which can trigger React's "Can't perform a React state update on an unmounted component" warning if any state is touched in the callback chain.

**Concrete failure scenario:** User is typing code in a problem editor (triggering snapshot ticks). They quickly navigate away (e.g., click Back button) while a snapshot tick is mid-flight. The component unmounts, cleanup runs, but then the tick's `apiFetch` promise resolves and schedules a new timer. That timer fires ~10-60 seconds later, and `tick` runs with stale refs. While the current implementation doesn't set state directly in `tick`, future modifications could introduce such state updates.

**Fix:** Add a `mountedRef` boolean that `tick` checks before scheduling the next timer:
```ts
const isMountedRef = useRef(true);
useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
}, []);
```
And in `tick`, guard the recursive `setTimeout` with `if (!isMountedRef.current) return;`.

---

## Previously Fixed Items (confirmed in current code)

All prior cycle fixes verified in place:
- Cycle 44: formData.get() safe extraction in admin routes (import, restore)
- Cycle 44: SSE cleanup timer export for test teardown
- Cycle 43: Audit flush timer export for test teardown
- Cycle 43: contest-scoring.ts Date.now() fallback in catch + staleness check
- All earlier fixes from cycles 39-42 remain in place

## Carried Deferred Items (unchanged)

All deferred items from cycles 25-42 remain unchanged. See `_aggregate-cycle-48.md` for the full list.

## No Agent Failures

This review was conducted as a single comprehensive pass due to lack of Agent tool availability for parallel fan-out. All review-relevant files in the repository were examined.
