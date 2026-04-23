# Performance Review — RPF Cycle 22

**Date:** 2026-04-22
**Reviewer:** perf-reviewer
**Base commit:** 88abca22

## PERF-1: `rate-limiter-client.ts` `consecutiveFailures` is module-level mutable state without atomicity — minor race in serverless [LOW/LOW]

**File:** `src/lib/security/rate-limiter-client.ts:43-46`
**Confidence:** LOW

The circuit breaker state (`consecutiveFailures`, `circuitOpenUntil`) is module-level mutable state. In a serverless or multi-instance deployment, each instance has its own circuit breaker state. If the rate-limiter sidecar goes down, each instance independently trips its breaker — this is actually correct behavior (fail-open per instance). The concern is that in a single Node.js process, concurrent requests could race on `consecutiveFailures++`, but since Node.js is single-threaded, this is not a real issue.

**Fix:** No action needed. The current implementation is correct for the Node.js single-threaded model.

---

## Carried Items (Unchanged from Previous Cycles)

- PERF-1 (from aggregate): `recruiter-candidates-panel.tsx` full export fetch — carried as DEFER-29
- PERF-2 (from aggregate): Practice page Path B progress filter — carried from cycles 18-20
- AGG-4 (from cycle 21): `contest-replay.tsx` `setInterval` without visibility awareness — carried as DEFER-3

---

## Verified Safe

- All polling components use `useVisibilityPolling` with AbortController
- `contest-quick-stats` properly validates response data with `Number.isFinite`
- `submission-list-auto-refresh` uses recursive `setTimeout` with backoff
- Anti-cheat heartbeat uses recursive `setTimeout` (not `setInterval`)
- `countdown-timer` has visibility-aware recalculation on tab switch
- `active-timed-assignment-sidebar-panel` has `visibilitychange` listener (fixed in cycle 18)
- `apiFetchJson` helper avoids double `.json()` parsing
