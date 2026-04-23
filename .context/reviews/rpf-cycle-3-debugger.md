# RPF Cycle 3 — Debugger

**Date:** 2026-04-22
**Base commit:** 678f7d7d

## Findings

### DBG-1: `SubmissionListAutoRefresh` — `router.refresh()` never throws, making `errorCountRef` permanently zero [MEDIUM/HIGH]

**File:** `src/components/submission-list-auto-refresh.tsx:38-44`
**Confidence:** HIGH

This is a latent bug. The `try { router.refresh(); errorCountRef.current = 0; } catch { errorCountRef.current += 1; }` pattern on lines 38-44 never enters the catch branch because `router.refresh()` does not throw on network errors. The `errorCountRef` will always be 0, making `getBackoffInterval()` always return `baseInterval`.

**Concrete failure scenario:** User is on a train with intermittent connectivity. Server becomes unreachable. The auto-refresh keeps firing at 5-second intervals with no backoff, generating failed network requests and wasting battery.

**Fix:** Replace `router.refresh()` with a `fetch()` call that can actually fail, then call `router.refresh()` only on success.

---

### DBG-2: `contest-clarifications.tsx` — race condition in `syncVisibility` can create duplicate intervals [MEDIUM/MEDIUM]

**File:** `src/components/contest/contest-clarifications.tsx:94-118`
**Confidence:** HIGH

The `syncVisibility` function uses a local `interval` variable. When `visibilitychange` fires with `"visible"`, it checks `if (!interval)` before creating a new interval. However, between two rapid visibility events, the first interval might not have been assigned to the closure variable yet, or the check `!interval` might pass twice if the events fire faster than the event loop can process them.

Additionally, the `clearInterval(interval)` on line 106 only runs when `interval` is truthy, but the `interval` variable is scoped to the outer `useEffect` callback. If `syncVisibility` is called from the event listener after the effect has cleaned up and re-run, the old `interval` reference is stale.

**Fix:** Use a `useRef` for the interval ID instead of a local variable, and always clear before creating.

---

### DBG-3: `recruiting-invitations-panel.tsx` — `fetchData` has `stats` in `useCallback` dependency array [MEDIUM/MEDIUM]

**File:** `src/components/contest/recruiting-invitations-panel.tsx:110-134`
**Confidence:** HIGH (same as CR-4)

`stats` is used as a fallback on line 128 (`json.data ?? stats`) and is in the dependency array. When `fetchData` updates `stats`, the `useCallback` reference changes, which triggers the `useEffect` on line 136, which calls `fetchData` again. This creates a potential infinite loop that is only prevented by React's bailout optimization (setState with same reference). However, if the server returns slightly different data on each fetch, this could loop.

**Fix:** Use functional state update: `setStats(prev => json.data ?? prev)` and remove `stats` from the dependency array.

---

### DBG-4: `compiler-client.tsx` — `handleRemoveActiveTestCase` uses `testCases` state in dependency array but also reads it directly [LOW/LOW]

**File:** `src/components/code/compiler-client.tsx:219-227`
**Confidence:** LOW

The `handleRemoveActiveTestCase` callback reads `testCases.length` (line 220) and `testCases.findIndex` (line 222) from the state, and has `testCases` in the dependency array. This means the callback is recreated whenever `testCases` changes, which happens on every test case add/remove/edit. This is correct behavior but could be optimized using functional updates.

---

## Verified Safe

- `use-source-draft.ts` localStorage.removeItem calls are properly wrapped in try/catch
- `compiler-client.tsx` keyboard shortcut correctly checks `document.activeElement` to avoid firing in textarea/input
- `anti-cheat-monitor.tsx` privacy notice uses `<Button>` component correctly
- `submission-detail-client.tsx` `handleRetryRefresh` properly handles fetch errors
