# Performance Reviewer Review — Cycle 4/100

**Date:** 2026-05-08
**Scope:** UI responsiveness, network efficiency, timer management, and resource leaks
**Approach:** Code analysis of timer lifecycle, event listener cleanup, and async patterns

---

## Findings

### P1 — Timer leak in SubmissionListAutoRefresh causes background network traffic after unmount
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **File:** `src/components/submission-list-auto-refresh.tsx:60-74`
- **Problem:** When the component unmounts while `tick()` is awaiting the `/api/v1/time` fetch, the cleanup function clears `timerRef.current` but the async callback inside `setTimeout` continues. After `await tick()` resolves, it calls `scheduleNext()` unconditionally, creating a new timer. This timer fires indefinitely, causing:
  - Wasted network requests to `/api/v1/time` and subsequent `router.refresh()`
  - Unnecessary CPU from React re-renders on the new page
  - Potential memory accumulation if the user navigates through many submission-list pages
- **Impact:** Medium — the endpoint is lightweight, but on a busy admin dashboard the cumulative effect is non-zero.
- **Fix:** Add a mounted guard:
  ```tsx
  function scheduleNext() {
    timerRef.current = setTimeout(async () => {
      await tick();
      if (timerRef.current !== null) {
        scheduleNext();
      }
    }, getBackoffInterval());
  }
  ```
- **Cross-agent agreement:** Also flagged by code-reviewer as C1.

### P2 — Dashboard health snapshot re-fetches on every render
- **Severity:** LOW
- **Confidence:** LOW
- **File:** `src/app/(dashboard)/dashboard/page.tsx`
- **Problem:** The dashboard page uses server components that fetch health data on every request. There is no caching or stale-while-revalidate strategy for the health snapshot.
- **Impact:** Low — the queries are small and fast, but under high concurrency the health checks themselves add load.
- **Fix:** Not recommended to fix in this cycle; real-time health data is intentional.

---

## No Other Performance Issues Found

All event listeners in components have proper cleanup. No memory leaks detected in useEffect patterns. The anti-cheat monitor correctly clears its retry timer. The compiler client aborts in-flight requests on unmount.
