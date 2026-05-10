# Debugger Review — Cycle 34

**Reviewer:** debugger
**Date:** 2026-05-10
**Scope:** Latent bugs, failure modes, edge cases, race conditions

---

## Findings

### C34-DB-1: [MEDIUM] Rate limit eviction timer leaks across test boundaries

**File:** `src/lib/security/rate-limit.ts:68-80`
**Confidence:** HIGH

The `startRateLimitEviction()` function stores its timer in a module-level variable. When tests import modules transitively depending on rate-limit.ts, the timer starts. There is no way to stop it, so tests that check for clean exits will fail.

This is a classic module-level singleton leak pattern.

**Fix:** Export `stopRateLimitEviction()`.

---

### C34-DB-2: [LOW] `anti-cheat-monitor` scheduleRetryRef closure over stale performFlush

**File:** `src/components/exam/anti-cheat-monitor.tsx:115-128`
**Confidence:** MEDIUM

The `scheduleRetryRef` useEffect depends on `[performFlush]`. When `performFlush` identity changes, a new `scheduleRetryRef.current` is assigned. However, any in-flight retry timer (created before the identity change) captures the OLD `performFlush` in its closure at line 123:

```typescript
retryTimerRef.current = setTimeout(async () => {
  retryTimerRef.current = null;
  const retryRemaining = await performFlush(); // stale closure
  scheduleRetryRef.current(retryRemaining);
}, backoffDelay);
```

In practice, `performFlush` only changes when `assignmentId` or `sendEvent` changes (prop changes), so the stale closure would use old prop values.

**Fix:** Use a ref for `performFlush` or inline the retry logic in the same useEffect that manages cleanup.

---

### C34-DB-3: [LOW] `apiFetchJson` parse failure gives no debug signal

**File:** `src/lib/api/client.ts:138-144`
**Confidence:** MEDIUM

When JSON parsing fails, developers have no signal about what went wrong. The only observable behavior is `{ ok: false, data: fallback }`. This makes it impossible to distinguish between:
- Server returned non-JSON (e.g., 502 HTML)
- Server returned malformed JSON
- Network error (now handled by the fetch try/catch added in cycle 33)

**Fix:** Add development-only logging.

---

## Previously Fixed (cycle 33)

- C33-DB-1 (anti-cheat flush race): Addressed via `performFlush` extraction
- C33-DB-2 (submission-list-auto-refresh concurrent tick): Fixed — `mountedRef` guard added
- C33-DB-3 (export-button blob leak): Fixed — `blobUrlRef` with revoke
- C33-DB-4 (sign-out iteration race): Fixed — keys snapshotted before iteration

## Positive Observations

1. `isRunningRef` guard in compiler-client prevents concurrent runs.
2. AbortController in compiler-client properly cancels in-flight requests.
3. Heartbeat cleanup in anti-cheat monitor properly clears timers.
