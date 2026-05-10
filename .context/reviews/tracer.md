# Tracer Review — Cycle 33

**Reviewer:** tracer
**Date:** 2026-05-10
**Scope:** Causal tracing of suspicious flows, competing hypotheses

---

## Findings

### C33-TR-1: [MEDIUM] Hypothesis: Timer leak causes memory accumulation in long-running sessions

**File:** `src/components/submission-list-auto-refresh.tsx`
**Confidence:** MEDIUM

If a user navigates between pages with submission lists frequently (e.g., a proctor monitoring multiple contests), each unmount during the initial tick leaks a timer. After 100 navigations, 100 timers could be running, each calling `router.refresh()`.

**Trace:**
1. User loads page with active submissions
2. useEffect runs, calls `start()`
3. `tick()` awaits `apiFetch("/api/v1/time")`
4. User navigates away (component unmounts)
5. Cleanup runs: `timerRef.current = null`
6. `tick()` completes
7. `scheduleNext()` runs (timerRef was already set to null by cleanup, but wait...)

Wait — actually re-reading: `start()` awaits `tick()` then calls `scheduleNext()`. `tick()` includes the fetch. If unmount happens during `tick()`, cleanup sets `timerRef.current = null`. Then `tick()` returns, and `scheduleNext()` sets `timerRef.current = setTimeout(...)`. Since cleanup already ran, this new timer is never cleared.

**Confirmed.** Timer leak on unmount during async tick.

---

### C33-TR-2: [LOW] Hypothesis: sign-out misses keys due to concurrent modification

**File:** `src/lib/auth/sign-out.ts`
**Confidence:** LOW

Scenario: Tab A calls handleSignOutWithCleanup. During iteration, tab B (same origin) writes a new localStorage key. Tab A's loop:
1. i=0, key(0) = "oj:draft1"
2. Tab B writes "oj:draft2"
3. Tab A continues, i=1, but key(1) might now be "oj:draft3" (shifted)
4. "oj:draft2" is never processed

While unlikely and low-impact (draft data left behind), the pattern is technically incorrect.

---

## Positive Observations

1. Anti-cheat retry scheduling uses ref-based delegation correctly to avoid circular deps.
2. The performFlushRef pattern in anti-cheat is a clever solution to the useCallback circularity problem.
