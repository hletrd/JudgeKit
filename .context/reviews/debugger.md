# Debugger Review — Cycle 9

**Reviewer:** debugger (orchestrator direct)
**Date:** 2026-05-08
**HEAD:** c5eb175b (cycle 8 close-out)
**Scope:** Latent bug surface, failure modes, race conditions, regressions

---

## NEW FINDINGS

### C9-DB-1 — AntiCheatMonitor heartbeat timer restarts after enabled toggles off

- **Severity:** MEDIUM
- **Confidence:** HIGH
- **File:** `src/components/exam/anti-cheat-monitor.tsx:180-188`
- **Problem:** Race condition between effect cleanup and async timer callback. When `enabled` becomes false while a heartbeat `await reportEventRef.current("heartbeat")` is in-flight, the cleanup clears `heartbeatTimerRef.current` but the in-flight promise resolves and calls `scheduleHeartbeat()` which schedules a new timer.
- **Failure scenario:**
  1. Component mounts with `enabled=true`, heartbeat effect schedules timer H1
  2. H1 fires, visibility is visible, starts `await reportEventRef.current("heartbeat")`
  3. User navigates away, parent sets `enabled=false`
  4. Effect cleanup runs: clears H1, sets `heartbeatTimerRef.current = null`
  5. Heartbeat await resolves, calls `scheduleHeartbeat()`
  6. `scheduleHeartbeat` sees `heartbeatTimerRef.current === null`, skips clear
  7. NEW timer H2 is scheduled with `setTimeout(..., HEARTBEAT_INTERVAL_MS)`
  8. H2 fires indefinitely, calling `reportEventRef.current("heartbeat")` forever
- **Fix:** Guard `scheduleHeartbeat` with a ref that tracks whether the current effect instance is still active. Set the ref to true when the effect runs and false in cleanup; check it before scheduling.

### C9-DB-2 — OutputDiffView index-based keys could mismatch on output refresh

- **Severity:** LOW
- **Confidence:** MEDIUM
- **File:** `src/components/submissions/output-diff-view.tsx:43, 84, 111`
- **Problem:** If submission detail auto-refreshes and expected/actual outputs change (e.g., from empty to populated after judge completes), React uses index keys and may not correctly update DOM rows that shifted position.
- **Failure scenario:** Diff view shows old line highlighting at wrong positions after output update. Cosmetic only.
- **Fix:** Use composite keys based on line data.

---

## CARRY-FORWARD DEFERRED ITEMS

All previously deferred items remain unchanged. Not re-reported per cycle instructions.

---

## AGENT FAILURES

No agent failures. Review performed directly by orchestrator.
