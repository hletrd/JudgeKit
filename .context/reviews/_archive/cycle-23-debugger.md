# Cycle 23 Debugger Review

**Date:** 2026-04-20
**Base commit:** bb6f3fc2

## Findings

### DBG-1: `countdown-timer.tsx` raw `fetch()` -- missed apiFetch migration [MEDIUM/HIGH]

**Files:** `src/components/exam/countdown-timer.tsx:76`
**Description:** Same as CR-1/SEC-1/CRI-1. The exam timer's raw `fetch()` call is the last remaining client-side fetch bypass. From a debugging perspective, if the `/api/v1/time` endpoint ever returns an error (e.g., 503 during server maintenance), the `catch` block silently keeps the offset at 0. This is acceptable behavior, but the raw fetch means the error will not include the `X-Requested-With` header, which could cause confusion if the endpoint is later changed to a POST (which would be CSRF-gated).
**Fix:** Replace with `apiFetch`.
**Confidence:** HIGH

### DBG-2: `contest-quick-stats.tsx` empty catch makes debugging harder [LOW/MEDIUM]

**Files:** `src/components/contest/contest-quick-stats.tsx:76-78`
**Description:** Same as CR-2/CRI-2. The `catch { // ignore }` pattern means that if the stats fetch fails, there is no console output, no toast, and no state change to indicate failure. During debugging, a developer would need to add logging to understand why stats are not updating. This wastes debugging time.
**Fix:** Add toast error and/or development-mode console logging.
**Confidence:** MEDIUM

## Verified Safe

- Timer offset calculation in `countdown-timer.tsx` correctly handles round-trip time.
- All `useEffect` cleanup functions properly clear intervals and remove event listeners.
- The `leaderboard-table.tsx` visibility check prevents unnecessary network requests.
