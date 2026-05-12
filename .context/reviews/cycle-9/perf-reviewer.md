# Performance Reviewer — Cycle 9

**Date:** 2026-05-11
**HEAD reviewed:** `06f74d76`
**Change surface:** 0 new commits since cycle 8.

---

## Finding C9-PR-1: countdown-timer leaked AbortController on rapid tab switches (LOW)

**File:** `src/components/exam/countdown-timer.tsx:186`
**Confidence:** High

Each visibility change to "visible" creates a new `syncTime()` call with a fresh AbortController. If a user rapidly switches tabs (e.g., Alt+Tab spam), multiple sync requests can be in flight simultaneously. The returned cleanup functions are discarded, so old requests and their timeout timers are never aborted. In extreme cases this could queue multiple concurrent `/api/v1/time` requests.

**Suggested fix:** Track the current sync cleanup in a ref and abort it before starting a new one.

---

## Finding C9-PR-2: apiFetch fallback timer leak (LOW)

**File:** `src/lib/api/client.ts:97-98`
**Confidence:** Low

The fallback `setTimeout` in `createTimeoutSignal` leaks a timer in old browsers. Impact is minimal (30s timer, old browsers only).

---

## Final Sweep

No new performance regressions. SSE polling, submission rate limiting, and anti-cheat heartbeat patterns remain within acceptable bounds. The 5000-row heartbeat cap and 10,000-row export cap are still appropriate.
