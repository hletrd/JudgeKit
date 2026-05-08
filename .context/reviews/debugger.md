# Debugger Review — Cycle 12/100

**Reviewer:** debugger (orchestrator direct)
**Date:** 2026-05-08
**HEAD:** e584aeac
**Scope:** Latent bug surface, failure modes, regressions

---

## NEW FINDINGS

### C12-DB-1 — Judge deregister route: malformed JSON bypasses validation and returns 500
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **File:** `src/app/api/v1/judge/deregister/route.ts:24`
- **Problem:** The deregister route was excluded from the cycle 10 fix that added try/catch around `request.json()` in judge routes. A truncated or malformed JSON body triggers a SyntaxError that the outer catch block handles as an internal server error. This is a regression from the cycle 10 remediation pattern.
- **Failure mode:** Worker sends malformed JSON → SyntaxError → caught by outer try/catch → 500 internalServerError logged. Worker sees 500 and retries with same payload, creating a retry loop that generates error-log noise.
- **Fix:** Wrap `await request.json()` in try/catch, return 400 invalidJson on parse failure.

### C12-DB-2 — CountdownTimer: deadline prop change leaves component stuck in expired state
- **Severity:** LOW
- **Confidence:** MEDIUM
- **File:** `src/components/exam/countdown-timer.tsx:46-65`
- **Problem:** The `expired` state and `firedThresholds` ref are initialized once on mount and never react to `deadline` prop changes. If an exam deadline is extended while the component is mounted, `expired` remains true and the display shows "00:00:00" regardless of the actual remaining time. The `handleExpired` callback also guards against re-firing via `expiredRef`, so even if the new deadline passes again, `onExpired` won't fire.
- **Failure mode:** Admin extends exam deadline. Student's countdown shows "00:00:00" instead of the new remaining time. Student may incorrectly think the exam has ended.
- **Fix:** Reset `expired` state and recompute `firedThresholds` when `deadline` changes.

### C12-DB-3 — CountdownTimer: staggered toast timers leak on unmount
- **Severity:** LOW
- **Confidence:** MEDIUM
- **File:** `src/components/exam/countdown-timer.tsx:126`
- **Problem:** When `staggerToasts=true`, the delayed setTimeout callbacks are not stored for cleanup. While the `cancelled` flag prevents state updates, the timers remain in the browser's timer queue until they fire. Frequent mount/unmount cycles (rare for exam countdown but possible in test environments) could accumulate orphaned timers.
- **Fix:** Collect staggered timer IDs in an array ref and clear them all on cleanup.

---

## No Regressions Detected

Cycle 10 and 11 fixes remain intact. JSON parse guards in register, claim, heartbeat, and poll routes are working. apiFetchJson parse-ok check is correct. Contest join shake timer cleanup is in place.
