# Code Review — Cycle 13/100

**Reviewer:** code-reviewer (manual, single-agent)
**Date:** 2026-05-08
**HEAD:** b3c16d3a
**Scope:** Full TypeScript/TSX source review, API routes, client components

---

## NEW FINDINGS

### C13-CR-1 — Multiple components fetch data without AbortController cleanup [LOW]
- **Severity:** LOW
- **Confidence:** HIGH
- **Files:**
  - `src/app/(dashboard)/dashboard/admin/languages/language-config-table.tsx:132` — `fetchImageStatus()` in useEffect
  - `src/components/lecture/submission-overview.tsx:90` — `apiFetch` in useEffect
  - `src/components/problem/accepted-solutions.tsx:72` — `apiFetchJson` in useEffect
  - `src/components/submissions/submission-detail-client.tsx:131` — queue-status `apiFetch`
- **Problem:** These components initiate fetch requests inside `useEffect` but do not attach an `AbortController.signal`. If the component unmounts (or effect re-runs) while the request is in flight, the promise still resolves and calls `setState` on an unmounted component. React logs a development warning. This is a cleanup gap consistent with patterns already fixed in `compiler-client.tsx` (cycle 8) and `language-config-table.tsx` build/remove handlers (cycle 11).
- **Fix:** Create an `AbortController` in the effect, pass `signal` to the fetch call, and abort it in the cleanup function.

### C13-CR-2 — `AcceptedSolutions` cancelled flag does not cancel the underlying fetch [LOW]
- **Severity:** LOW
- **Confidence:** MEDIUM
- **File:** `src/components/problem/accepted-solutions.tsx:58-105`
- **Problem:** The component correctly uses a `cancelled` flag to skip `setState` after cleanup, but the underlying `fetch` continues to completion. If the user rapidly changes sort/language/page, multiple requests can be in flight simultaneously, consuming bandwidth and browser connection slots. The earlier requests' responses are ignored but the network work is still done.
- **Fix:** Use `AbortController` and abort the previous fetch before starting a new one when sort/language/page changes.

## Previously Fixed (Verified at HEAD)

| ID | Status | Note |
|---|---|---|
| C12-CR-1 (deregister JSON guard) | FIXED | Commit `7417ae55` adds try/catch around `request.json()` |
| C12-CR-2 (staggered timer cleanup) | FIXED | Commit `b3c16d3a` clears `staggeredTimerIdsRef` in cleanup |
| C12-CR-3 (deadline reactivity) | FIXED | Commit `b3c16d3a` resets expired/firedThresholds on deadline change |

## Carry-forward Deferred Items (NOT re-reported)

- C12b-1: Moderation query fetches all then filters in JS — MEDIUM, deferred
- C12b-2: Duplicated sort logic in four list functions — LOW, deferred
- C12b-3: `Date.now()` for yield timing in code-similarity — LOW, deferred
