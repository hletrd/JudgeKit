# Debugger — RPF Cycle 6

## Scope
Latent bug surface and failure mode analysis.

## Findings

### DBG-1: `anti-cheat-dashboard.tsx` — Polling replaces loaded data, breaking `loadMore` pagination
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **File:** `src/components/contest/anti-cheat-dashboard.tsx:118-136, 138-155`
- **Problem:** `fetchEvents` always sets `offset` to `json.data.events.length` (line 127), which is at most `PAGE_SIZE` (100). If the user has already loaded 200+ events via `loadMore`, the next poll resets `offset` to 100. The next `loadMore` then fetches offset=100, which returns events the user already has (duplicates from offset 100-199) or skips events depending on timing.
- **Failure scenario:**
  1. Dashboard loads, fetches first 100 events, offset=100
  2. User clicks "load more", fetches next 100, now shows 200 events, offset=200
  3. 30-second poll fires, `fetchEvents` runs, replaces events with first 100, sets offset=100
  4. User sees only 100 events instead of 200
  5. User clicks "load more" again, fetches offset=100, which is a duplicate page
- **Fix:** Either preserve offset across polls, or make polling only update the total count and prepend new events without replacing the entire list.

### DBG-2: `recruiting-invitations-panel.tsx` — `handleCreate` no catch block (confirms CR-2, SEC-1)
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **File:** `src/components/contest/recruiting-invitations-panel.tsx:150-213`
- **Failure scenario:** Network goes offline during invitation creation. `apiFetch` throws a TypeError. The `finally` block sets `creating=false`, but no error toast is shown. The user sees the dialog close silently with no feedback.
- **Fix:** Add `catch { toast.error(t("createError")); }`.

### DBG-3: `countdown-timer.tsx` — Server time fetch has no timeout fallback for late responses
- **Severity:** LOW
- **Confidence:** LOW
- **File:** `src/components/exam/countdown-timer.tsx:74-97`
- **Problem:** The `/api/v1/time` fetch has a 5-second AbortController timeout. If the server is slow (>5s), the fetch is aborted and offset stays at 0. The timer then uses `Date.now()` without correction, which is the correct fallback behavior. No bug here — the fallback is sound.

### DBG-4: Carried from cycle 28 — localStorage crashes in private browsing
- **Status:** CONFIRMED FIXED
