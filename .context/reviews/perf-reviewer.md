# Perf-Reviewer Pass — RPF Cycle 2/100

**Date:** 2026-04-26
**Lane:** perf-reviewer
**Scope:** Full repo with focus on hot paths (proxy middleware, analytics endpoint, anti-cheat client, judge worker, SSE)

## Summary

Cycle-1 perf wins (Date.now() staleness, single-pass eviction, head+tail truncation, buffer-based size cap) all confirmed in HEAD. Working-tree changes preserve those wins. New low-priority finding around redundant DB calls in cooldown-fallback path.

## Findings

### PERF2-1: [LOW] Cooldown fallback path makes 2 sequential DB calls when DB is sick
**File:** `src/app/api/v1/contests/[assignmentId]/analytics/route.ts:79,87-91`
**Confidence:** MEDIUM

When `computeContestAnalytics` succeeds but `await getDbNowMs()` (line 79) fails, the inner catch block runs, which re-attempts `await getDbNowMs()` (line 88) inside another try, then falls back to `Date.now()` (line 90). Under DB pressure, this means the unhappy path makes one DB call that fails (line 79), enters catch, then retries the same call (line 88). Effectively a small DB-pressure amplifier.

**Fix:** Use `Date.now()` directly in the cooldown-fallback path, avoiding the redundant DB attempt. Or apply the cycle-1 plan task-B Option 1 (use `Date.now()` consistently for cache/cooldown timestamps). 

### PERF2-2: [LOW] `authUserCache` cleanup at 90% capacity iterates entire Map
**File:** `src/proxy.ts:71-78`
**Confidence:** LOW

When cache hits 450 entries (90% of 500), every subsequent set triggers a full Map iteration to expire stale entries. Worst case: 500 iterations per `set` until eviction. In a steady state with light churn, this can run for many requests.

**Fix:** Track expired count separately, trigger cleanup only when expired count > N. Or run cleanup async via `queueMicrotask`. Defer — current behaviour is bounded and infrequent.

### PERF2-3: [LOW] `loadPendingEvents` parses JSON on every visibility / online / blur event
**File:** `src/components/exam/anti-cheat-monitor.tsx:101,170`
**Confidence:** LOW

Each call to `performFlush` and `reportEvent` (when offline) reads and parses localStorage. Per-event cost is microseconds, not a real perf risk.

**Fix:** Defer; not measurable.

### PERF2-4: [LOW] Heartbeat self-rescheduling closure allocates new setTimeout per fire
**File:** `src/components/exam/anti-cheat-monitor.tsx:204-210`
**Confidence:** LOW

`scheduleHeartbeat` creates a new closure on each call. Over a 60-minute exam with 30s interval, that's 120 timer allocations. Negligible per-call.

**Fix:** Defer; current implementation is correct and cost is negligible.

## Verification Notes

- `getDbNowMs()` in cache-hit fast path is ELIMINATED (line 62 uses `Date.now()`). Confirmed perf win from cycle 1.
- Anti-cheat `performFlush` is shared between manual flush and timer retry — no duplicated work.
- Proxy CSP header construction allocates strings, but unavoidable for nonce-based CSP.

## Confidence

All findings LOW or MEDIUM with low impact. No HIGH-severity perf regressions.
