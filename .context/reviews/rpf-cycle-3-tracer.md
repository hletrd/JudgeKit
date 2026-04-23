# RPF Cycle 3 — Tracer

**Date:** 2026-04-22
**Base commit:** 678f7d7d

## Causal Traces

### TR-1: Trace: `router.refresh()` error path — confirmed dead code [MEDIUM/HIGH]

**Hypothesis 1:** `router.refresh()` throws on network error, causing backoff.
**Hypothesis 2:** `router.refresh()` never throws, making backoff dead code.

**Trace:**
1. `SubmissionListAutoRefresh` useEffect sets up polling (line 24)
2. `tick()` calls `router.refresh()` (line 39)
3. `router.refresh()` comes from `useRouter()` from `next/navigation`
4. In Next.js App Router, `router.refresh()` calls `cache.invalidate()` internally and re-fetches server components
5. It uses `fetch()` internally but wraps it in a way that errors are swallowed (not propagated to caller)
6. The catch block on line 43 is unreachable for network errors

**Conclusion:** Hypothesis 2 is correct. The backoff is dead code.

**Fix:** Replace `router.refresh()` with `fetch()` + `router.refresh()`.

---

### TR-2: Trace: `fetchData` -> `stats` -> `fetchData` potential loop [MEDIUM/MEDIUM]

**Hypothesis 1:** `fetchData` updating `stats` causes infinite re-fetch loop.
**Hypothesis 2:** React's bailout optimization prevents the loop.

**Trace:**
1. `fetchData` is called by `useEffect` on line 136
2. `fetchData` calls `setStats(json.data ?? stats)` on line 128
3. `stats` changes, which is in `fetchData`'s dependency array (line 134)
4. `fetchData` is recreated with new closure
5. `useEffect` on line 136 has `fetchData` as dependency, so it re-runs
6. `fetchData` is called again
7. API returns same data -> `setStats(sameValue)` -> React bails out (no re-render)

**Conclusion:** Both hypotheses have merit. In practice, React's bailout prevents infinite loops when the API returns identical data. But if the API returns different timestamps or IDs on each call, the loop would be triggered. The dependency is semantically incorrect even if it works in practice.

**Fix:** Use functional update form `setStats(prev => json.data ?? prev)`.

---

### TR-3: Trace: `syncVisibility` interval leak on rapid tab switches [MEDIUM/MEDIUM]

**Trace:**
1. User switches to tab -> `visibilitychange` fires with `"visible"`
2. `syncVisibility()` runs: `interval` is null, creates new `setInterval`
3. User quickly switches away and back -> `visibilitychange` fires twice rapidly
4. First `"hidden"` event: `clearInterval(interval)`, sets `interval = null`
5. Second `"visible"` event: `if (!interval)` passes, creates new `setInterval`
6. This works correctly for the sequential case

**However:**
1. If two `"visible"` events fire before any `"hidden"` event:
2. First `"visible"`: creates interval, assigns to `interval`
3. Second `"visible"`: `if (!interval)` is FALSE (interval is truthy), skips creation
4. Result: Only one interval exists — correct

**Revised conclusion:** The race condition is less severe than initially thought. The local `interval` variable is set synchronously before the next event can fire. However, the code is fragile and depends on JavaScript's single-threaded event loop. Using a `useRef` would be more robust.

---

## Verified Safe

- Clipboard utility trace: `copyToClipboard()` -> navigator.clipboard -> execCommand fallback -> returns boolean — works correctly
- Contest layout trace: Click handler checks `data-full-navigate` attribute -> only hard-navigates for marked links — works correctly
