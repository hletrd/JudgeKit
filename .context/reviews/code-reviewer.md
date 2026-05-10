# Code Review — Cycle 34

**Reviewer:** code-reviewer
**Date:** 2026-05-10
**Scope:** Client utilities, rate limiting, async patterns, anti-cheat monitor

---

## Findings

### C34-CR-1: [MEDIUM] `apiFetchJson` parse failures silently swallowed in development

**File:** `src/lib/api/client.ts:138-144`
**Confidence:** HIGH

The `apiFetchJson` helper catches `res.json()` failures silently:

```typescript
try {
  data = await res.json() as T;
  parseOk = true;
} catch {
  data = fallback;
}
```

In development, when an API returns non-JSON (e.g., a 502 HTML page from nginx, a misconfigured middleware response), developers have no visibility into what went wrong or which endpoint failed. This was flagged by the security-reviewer in cycle 33 (C33-SR-4) but not yet implemented.

**Fix:** Add a development-only warning:
```typescript
} catch {
  if (process.env.NODE_ENV === "development") {
    console.warn("apiFetchJson: JSON parse failed for", input, "status:", res.status);
  }
  data = fallback;
}
```

---

### C34-CR-2: [MEDIUM] Rate limit eviction timer has no cleanup function

**File:** `src/lib/security/rate-limit.ts:68-80`
**Confidence:** HIGH

`startRateLimitEviction()` starts a `setInterval` that runs indefinitely:

```typescript
export function startRateLimitEviction() {
  if (evictionTimer) return;
  evictionTimer = setInterval(() => {
    void evictStaleEntries();
  }, EVICTION_INTERVAL_MS);
  if (evictionTimer && typeof evictionTimer === "object" && "unref" in evictionTimer) {
    evictionTimer.unref();
  }
}
```

There is no exported `stopRateLimitEviction()` function. In test environments (Vitest with `--detectOpenHandles`), this causes open handle warnings. The timer also prevents clean process shutdown in scripts that import this module.

**Fix:** Export `stopRateLimitEviction()`:
```typescript
export function stopRateLimitEviction() {
  if (evictionTimer) {
    clearInterval(evictionTimer);
    evictionTimer = null;
  }
}
```

---

### C34-CR-3: [LOW] `anti-cheat-monitor` retry timer ref not guarded in separate useEffect

**File:** `src/components/exam/anti-cheat-monitor.tsx:115-128,280-283`
**Confidence:** MEDIUM

The `scheduleRetryRef` is updated in one useEffect (lines 115-128) while the timer cleanup happens in another useEffect's cleanup (lines 280-283). When `performFlush` identity changes, `scheduleRetryRef.current` is reassigned. Any in-flight retry timer callback was created with the OLD `performFlush` closure. The callback at line 123 references `performFlush` directly from the outer scope, so it uses the stale closure.

In practice, `performFlush` only changes when `assignmentId` or `sendEvent` changes, which only happens on prop changes (not during normal operation). Risk is low but the pattern is fragile.

**Fix:** Move the retry scheduling logic into the same useEffect that handles cleanup, or use a ref for `performFlush`.

---

## Previously Deferred Items (re-validated)

- C33-CR-1 (timer leak): Fixed — `mountedRef` guard present in submission-list-auto-refresh
- C33-CR-2 (apiFetchJson fetch throw): Fixed — try/catch around `apiFetch` call present
- C33-CR-3 (export-button AbortController): Fixed — `abortRef` and `blobUrlRef` present
- C33-CR-4 (contests layout null checks): Fixed — nullish coalescing on `main`/`sidebar` listeners
- C33-CR-5 (sign-out race condition): Fixed — keys snapshotted before iteration
- DEFER-C30-4 (`.json()` before `.ok`): Still present in `src/lib/docker/client.ts:96` but wrapped in try/catch (safe pattern)
- DEFER-C30-5 (raw API error strings without i18n): Still present in many client components
- DEFER-C30-6 (`as { error?: string }` unsafe assertions): Still present in ~15 instances

## Positive Observations

1. All error boundary `console.error` calls are gated behind `NODE_ENV === "development"`.
2. `apiFetchJson` properly wraps both fetch and JSON parsing in try/catch.
3. Sign-out storage iteration correctly snapshots keys before mutation.
4. Export button properly cancels in-flight requests and revokes blob URLs.
