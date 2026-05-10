# Code Review — Cycle 33

**Reviewer:** code-reviewer
**Date:** 2026-05-10
**Scope:** Client components, hooks, API client utilities, timer/async patterns

---

## Findings

### C33-CR-1: [MEDIUM] Timer leak in submission-list-auto-refresh on unmount during initial tick

**File:** `src/components/submission-list-auto-refresh.tsx:60-77`
**Confidence:** HIGH

The `start()` function awaits `tick()` then calls `scheduleNext()`. If the component unmounts during the async `tick()` call (which includes a network fetch), the cleanup function runs and clears `timerRef.current`. However, after `tick()` completes, `scheduleNext()` still executes and sets a new timer. This timer will never be cleared because cleanup already ran.

```typescript
async function start() {
  await tick();        // if unmount happens here...
  scheduleNext();      // ...this still runs and sets a leaked timer
}
```

**Failure scenario:** User navigates away from a page with active submissions while the initial time endpoint fetch is in flight. A timer is leaked that continues calling `router.refresh()` indefinitely.

**Fix:** Check a mounted ref before scheduling next:
```typescript
const mountedRef = useRef(true);
useEffect(() => {
  mountedRef.current = true;
  async function start() {
    await tick();
    if (mountedRef.current) scheduleNext();
  }
  void start();
  return () => { mountedRef.current = false; /* existing cleanup */ };
}, [...]);
```

---

### C33-CR-2: [MEDIUM] apiFetchJson does not handle fetch() throwing

**File:** `src/lib/api/client.ts:126-144`
**Confidence:** HIGH

The `apiFetchJson` helper is documented as safe wrapper that "eliminates common footguns," but if `fetch()` itself throws (network failure, CORS rejection, DNS error), the exception propagates unhandled. Only `res.json()` throwing is caught.

**Failure scenario:** Network interruption causes unhandled exception instead of graceful fallback.

**Fix:** Wrap the `apiFetch` call in try/catch:
```typescript
export async function apiFetchJson<T = unknown>(...) {
  let res: Response;
  try {
    res = await apiFetch(input, init);
  } catch {
    return { ok: false, data: fallback };
  }
  // ... existing parsing logic ...
}
```

---

### C33-CR-3: [LOW] export-button missing request cancellation

**File:** `src/components/contest/export-button.tsx:14-43`
**Confidence:** MEDIUM

Large contest exports could take significant time. There is no AbortController to cancel in-flight requests if the user navigates away or clicks the other export button.

**Fix:** Add AbortController support:
```typescript
const abortRef = useRef<AbortController | null>(null);
// In handleExport: abortRef.current?.abort(); abortRef.current = new AbortController();
// Pass signal to apiFetch
```

---

### C33-CR-4: [LOW] contests layout queries DOM elements that may not exist

**File:** `src/app/(public)/contests/manage/layout.tsx:42-45`
**Confidence:** MEDIUM

The layout queries `document.getElementById("main-content")` and `document.querySelector("[data-slot='sidebar']")` in useEffect. These elements may not exist during initial render or if the DOM structure changes. The effect depends on `pathname` but the queried elements might be stale after navigation.

**Fix:** Add null checks and consider using a ref-based approach or event delegation on document.

---

### C33-CR-5: [LOW] sign-out storage iteration race condition

**File:** `src/lib/auth/sign-out.ts:37-44`
**Confidence:** LOW

The for loop iterates over `window.localStorage.length` and accesses `key(i)`. If another tab modifies localStorage during iteration, indices shift and some keys may be skipped or an out-of-bounds access could occur.

**Fix:** Snapshot keys first: `const keys = Object.keys(window.localStorage)` or collect all keys in a single pass.

---

## Previously Deferred Items (re-validated)

- DEFER-C30-4: `.json()` before `.ok` — still 30+ instances in client components
- DEFER-C30-5: Raw API error strings without i18n — still present
- DEFER-C30-6: `as { error?: string }` — 15 instances remain
- C25-7: WeakMap complexity — unchanged

## Positive Observations

1. `apiFetchJson` and `parseApiResponse` are well-designed helpers that reduce footguns.
2. `sanitizeHtml` correctly restricts image src to root-relative paths.
3. Anti-cheat storage has MAX_PENDING_EVENTS cap for localStorage safety.
4. Most timer patterns use `useRef` for proper cleanup.
