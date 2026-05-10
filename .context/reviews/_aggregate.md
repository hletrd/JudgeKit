# Aggregate Review — Cycle 45 (RPF Loop)

**Date:** 2026-05-10
**Reviewers:** comprehensive-reviewer (single-agent review)
**Total findings:** 2 new (both LOW) + 0 false positives + prior cycle findings confirmed fixed

---

## Deduplicated Findings

### C45-1: [LOW] Timer leak in `withTimeout` when fetch completes before timeout expires

**Sources:** comprehensive-reviewer | **Confidence:** HIGH

`src/lib/abort.ts:25-44` — The `withTimeout` function creates a `setTimeout` that fires after `ms` milliseconds to abort the combined controller. If the underlying `fetch()` completes successfully before the timeout, the timer is never cleaned up. Each call to `apiFetch` with a custom `AbortSignal` leaves a dangling timer for up to 30 seconds.

**Concrete failure scenario:** A dashboard component polls every 5 seconds via `apiFetch(url, { signal: abortController.signal })`. After 60 seconds of active polling, 12 timers are pending even though all fetches completed successfully. Under sustained high-frequency API calls, this accumulates until each timer fires and self-cleans.

**Fix:** Add a `cleanupWithTimeout` export that clears the timer and removes the abort listener. Update `apiFetch` to call cleanup in a `.finally()` chain when a custom signal was provided.

---

### C45-2: [LOW] Code snapshot timer race on component unmount

**Sources:** comprehensive-reviewer | **Confidence:** MEDIUM

`src/components/problem/problem-submission-form.tsx:110-134` — The recursive `tick` function inside the code snapshot `useEffect` schedules the next timer via `setTimeout(tick, nextDelay)` after `apiFetch` resolves. If the component unmounts while `tick` is executing (after `apiFetch` resolves but before `setTimeout` is called), the cleanup function has already run and the new timer is not cleared.

**Concrete failure scenario:** User navigates away from a problem editor while a snapshot tick is mid-flight. The component unmounts, cleanup runs, but then `tick` schedules a new timer. That timer fires ~10-60 seconds later with stale refs.

**Fix:** Add a mounted guard ref that `tick` checks before scheduling the next timer.

---

## Previously Fixed Items (confirmed in current code)

All cycle 44 fixes verified:
- C44-1: `stopSseCleanupTimer()` exported in `src/app/api/v1/submissions/[id]/events/route.ts:150-156`
- C44-2: `formData.get()` safe extraction in admin import/restore routes

All cycle 43 fixes verified:
- C43-1: `stopAuditFlushTimer()` exported in `src/lib/audit/events.ts:156-161`

All earlier cycle fixes verified (cycles 25-42): All previously committed fixes remain in place with no regressions.

---

## Carried Deferred Items (unchanged from cycle 44)

All deferred items from cycles 25-41 remain unchanged in status. See prior cycle aggregates for details.

| Category | Count | Status |
|----------|-------|--------|
| CRITICAL | 3 | Unchanged |
| HIGH | 1 | Unchanged |
| MEDIUM | 5 | Unchanged |
| LOW | 12+ | Unchanged |

---

## No Agent Failures

Single comprehensive review completed successfully.
