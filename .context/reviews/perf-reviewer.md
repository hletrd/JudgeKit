# Performance Review — Cycle 12/100

**Reviewer:** perf-reviewer (orchestrator direct)
**Date:** 2026-05-08
**HEAD:** e584aeac
**Scope:** Performance, concurrency, CPU/memory/UI responsiveness

---

## NEW FINDINGS

### C12-PR-1 — CountdownTimer staggered setTimeout accumulation
- **Severity:** LOW
- **Confidence:** MEDIUM
- **File:** `src/components/exam/countdown-timer.tsx:126`
- **Problem:** When multiple threshold toasts are staggered (e.g., after tab regains focus), each delayed toast creates a `setTimeout` that is never tracked or cleared. On effect cleanup (unmount or deadline change), only the main `timerId` is cleared. The staggered timers remain in the browser's timer queue until they fire and self-cancel via the `cancelled` flag. With at most 3 thresholds and 4-second max delay, the leak is bounded but unnecessary.
- **Impact:** Minor timer queue pollution. Each orphaned timer consumes a small amount of browser memory until it fires.
- **Fix:** Track staggered timer IDs in a ref array and clear them all on cleanup.

---

## No Other Performance Issues Found

Recursive setTimeout patterns in useVisibilityPolling and api-keys-client are correctly implemented. Compiler execute timeout is bounded. Docker build output buffering is capped at 2MB. SSE connection limits are enforced. Rate limiter eviction runs on a 60s interval. No unnecessary re-renders detected in hot paths.
