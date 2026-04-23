# Debugger Review — RPF Cycle 25

**Date:** 2026-04-22
**Base commit:** ac51baaa

## DBG-1: `compiler-client.tsx` raw error message in toast description could show `[object Object]` [MEDIUM/HIGH]

**File:** `src/components/code/compiler-client.tsx:271-279`

When a compiler run fails, the toast shows `description: errorMessage` where `errorMessage` comes from `data.error || data.message || res.statusText || "Request failed"`. If `data.error` is an object instead of a string (e.g., `{ code: "timeout" }`), `errorMessage` would be `[object Object]`, which is confusing and doesn't help the user or developer diagnose the issue.

**Concrete failure scenario:** API returns `{ error: { code: "timeout" } }`. Toast description shows `[object Object]`.

**Fix:** Ensure `errorMessage` is always a string by adding `String()` wrapping or using i18n keys only.

---

## DBG-2: `contest-quick-stats.tsx` silently falls back to previous values on fetch failure [LOW/LOW]

**File:** `src/components/contest/contest-quick-stats.tsx:64-69`

When `ok` is true but `data.data` has invalid/missing fields, the code falls back to `prev` values silently. This means stale data could persist indefinitely if the API consistently returns malformed data, with no indication to the user or developer.

**Fix:** Add `console.warn()` when falling back to previous values due to invalid data shapes.

---

## DBG-3: `create-problem-form.tsx` `getErrorMessage` default leaks raw error.message -- confirmed from V-6 [MEDIUM/MEDIUM]

See V-6 for details. This is a bug surface because any unexpected error thrown in the try block will have its raw message displayed to the user.

---

## DBG-4: `assignment-form-dialog.tsx` `getErrorMessage` default leaks raw error.message -- confirmed from V-7 [MEDIUM/MEDIUM]

See V-7 for details. Same issue as DBG-3.

---

## DBG-5: `anti-cheat-monitor.tsx` retry timer cleanup -- verified correct [VERIFIED]

**File:** `src/components/exam/anti-cheat-monitor.tsx:130-135, 251`

Initially suspected that `retryTimerRef` wasn't properly cleaned up on component unmount. On closer inspection, the cleanup on line 251 properly clears `retryTimerRef.current` in the effect's cleanup function. No bug found.
