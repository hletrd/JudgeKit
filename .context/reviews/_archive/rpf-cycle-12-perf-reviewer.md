# Performance Review — Cycle 12 (HEAD: ecfa0b6c)

**Date:** 2026-05-11
**Reviewer:** perf-reviewer
**Scope:** Memory, concurrency, timer usage, fetch patterns

---

## Findings

### C12-PERF-1: apiFetch leaks timer memory when no caller signal provided
**Severity:** MEDIUM | **Confidence:** High
**File:** `src/lib/api/client.ts:97-98`

When `apiFetch` is called without a custom `signal`, it creates a timeout via `createTimeoutSignal(30_000)`. This uses `setTimeout(() => controller.abort(), ms)` internally. When the fetch completes before the timeout fires, the timer is never cleared because:
- The branch with `init.signal` (lines 91-94) calls `cleanupWithTimeout(signal)` in `.finally()`
- The branch without `init.signal` (lines 97-98) returns `fetch(input, { ...init, headers, signal })` directly with no cleanup

**Impact:** Every apiFetch call without a signal leaves a 30-second timer. In polling scenarios (submission status polling, anti-cheat dashboard auto-refresh, etc.), this accumulates hundreds of dangling timers per hour, increasing memory pressure and causing timer queue bloat.

**Fix:** Add `.finally(() => cleanupWithTimeout(signal))` to line 98, matching the pattern on line 92-94.

---

### C12-PERF-2: CountdownTimer creates redundant AbortControllers on rapid visibility changes
**Severity:** LOW | **Confidence:** Medium
**File:** `src/components/exam/countdown-timer.tsx:192-193`

When the tab rapidly switches between hidden/visible, each visibility change to "visible" aborts the previous sync and starts a new one. While `syncCleanupRef.current?.()` prevents concurrent in-flight requests, it doesn't rate-limit the sync calls themselves. Rapid tab switching (e.g., user alt-tabbing between apps) could create many aborted requests.

**Fix:** Add a small debounce (e.g., 500ms) to the visibility change handler to avoid excessive sync requests.

---

## Verified

- Prior perf fixes ( AbortController in polling, timer cleanup in CountdownTimer) remain intact.
- No new O(n^2) or O(n log n) hot paths detected.
