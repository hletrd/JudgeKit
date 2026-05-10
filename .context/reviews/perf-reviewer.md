# Performance Review — Cycle 34

**Reviewer:** perf-reviewer
**Date:** 2026-05-10
**Scope:** Timer leaks, rate limiting overhead, client-side rendering, DB query patterns

---

## Findings

### C34-PR-1: [MEDIUM] Rate limit eviction timer runs unconditionally

**File:** `src/lib/security/rate-limit.ts:68-80`
**Confidence:** HIGH

The `setInterval` for rate limit eviction runs every 60 seconds unconditionally once started. There is no mechanism to stop it. In Next.js development mode with hot reloading, each reload may re-import the module and call `startRateLimitEviction()`, potentially creating multiple timers (though the `if (evictionTimer) return` guard prevents duplicates within one module instance). In production, this is a minor background process. In test environments, it contributes to open handle warnings.

**Fix:** Export `stopRateLimitEviction()` for clean teardown.

---

### C34-PR-2: [LOW] `anti-cheat-monitor` heartbeat reschedules regardless of visibility

**File:** `src/components/exam/anti-cheat-monitor.tsx:185-191`
**Confidence:** MEDIUM

The heartbeat timer callback skips sending when `document.visibilityState !== "visible"`, but always calls `scheduleHeartbeat()` to reschedule:

```typescript
heartbeatTimerRef.current = setTimeout(async () => {
  if (!isHeartbeatActiveRef.current) return;
  if (document.visibilityState === "visible") {
    await reportEventRef.current("heartbeat");
  }
  scheduleHeartbeat();
}, HEARTBEAT_INTERVAL_MS);
```

When the tab is hidden for extended periods, the timer chain continues. With `HEARTBEAT_INTERVAL_MS = 30_000`, a tab hidden for 8 hours accumulates 960 timer callbacks that do nothing useful. While each callback is cheap, this is unnecessary work.

**Fix:** Only reschedule if visibility is visible or use `visibilitychange` to pause/resume the heartbeat:
```typescript
if (document.visibilityState === "visible") {
  await reportEventRef.current("heartbeat");
}
if (document.visibilityState === "visible" || isHeartbeatActiveRef.current) {
  scheduleHeartbeat();
}
```

---

### C34-PR-3: [LOW] `getDbNowMs` called synchronously-before-async in rate limit headers

**File:** `src/lib/security/api-rate-limit.ts:176-183`
**Confidence:** LOW

When the sidecar returns a rate-limit verdict, the code calls `await getDbNowMs()` to compute the `X-RateLimit-Reset` header. This adds an extra DB round-trip on the fast-path (sidecar already rejected). The DB time could be cached or the header could use `Date.now()` with a documented tolerance.

However, the consistency argument (avoiding clock skew) is valid. This is a minor overhead only when rate-limited.

---

## Previously Deferred Performance Items (re-validated)

- H-4 (In-memory rate limiter): **FIXED** — DB-backed only, no in-memory store
- C25-7 (WeakMap complexity): Unchanged — not a current performance concern
- C33-PR-1 (submission-list-auto-refresh re-renders): Unchanged — still uses router.refresh()

## Positive Observations

1. `apiFetchJson` eliminates double-`.json()` footgun via single-parse design.
2. `getDbNow` uses React.cache() for automatic deduplication within renders.
3. Judge claim uses atomic SQL CTEs instead of multiple round-trips.
4. Image processing uses streaming via sharp.
5. File upload validates size before reading into memory.
