# Comprehensive Review — Cycle 38

**Reviewer:** comprehensive-reviewer (single-agent, no subagents available)
**Date:** 2026-05-10
**Scope:** Full repository review focusing on recent changes (cycles 33-37 fixes) and remaining deferred issues

---

## Finding 1: [LOW] Anti-cheat monitor heartbeat permanently stops after tab-switch cycle

**Confidence:** HIGH
**File:** `src/components/exam/anti-cheat-monitor.tsx:190-191`

### Problem

The `scheduleHeartbeat` function (lines 182-194) gates BOTH the heartbeat send AND the timer reschedule on `document.visibilityState === "visible"`:

```ts
heartbeatTimerRef.current = setTimeout(async () => {
  if (!isHeartbeatActiveRef.current) return;
  if (document.visibilityState === "visible") {
    await reportEventRef.current("heartbeat");
  }
  if (document.visibilityState === "visible") {
    scheduleHeartbeat();  // <-- only reschedules when visible
  }
}, HEARTBEAT_INTERVAL_MS);
```

When the tab becomes hidden:
1. The timer fires after 30s
2. Visibility check at line 187 is false -> no heartbeat sent
3. Visibility check at line 190 is false -> `scheduleHeartbeat()` NOT called
4. `heartbeatTimerRef.current` is null after the callback completes
5. No timer is running

When the tab becomes visible again:
1. `handleVisibilityChange` fires (lines 210-217)
2. It sends an immediate heartbeat (line 215) and flushes pending events
3. But it does NOT call `scheduleHeartbeat()` — `scheduleHeartbeat` is scoped inside the heartbeat useEffect and is inaccessible
4. Heartbeats stop indefinitely

### Concrete Failure Scenario

A student starts an exam. The anti-cheat monitor begins sending heartbeats every 30s. The student switches to another tab to check something. When they return:
- The immediate "tab visible" heartbeat is sent
- No further heartbeats are ever sent
- If the student stays on the exam tab for 10 minutes without any user actions, there are zero heartbeats during that period
- An admin viewing the anti-cheat dashboard sees a gap in the heartbeat timeline and may incorrectly suspect the student closed the exam tab

### Root Cause

The fix introduced in cycle 34 (commit 474ea82d "gate heartbeat reschedule on document visibility") was intended to prevent heartbeats from firing while the tab is hidden. However, it also prevents the timer from rescheduling when hidden, and the visibility-change handler does not restart the timer when the tab becomes visible.

### Fix

Always reschedule the heartbeat timer regardless of visibility, but only send the heartbeat when visible:

```ts
heartbeatTimerRef.current = setTimeout(async () => {
  if (!isHeartbeatActiveRef.current) return;
  if (document.visibilityState === "visible") {
    await reportEventRef.current("heartbeat");
  }
  scheduleHeartbeat();  // always reschedule
}, HEARTBEAT_INTERVAL_MS);
```

This preserves the "don't send heartbeat while hidden" behavior while keeping the timer alive.

### Cross-Reference

- Cycle 34 AGG-4 noted: "Anti-cheat heartbeat reschedules while hidden" — the fix for that introduced this regression.
- Cycle 48 aggregate DEFER-55: "countdown-timer.tsx no retry on server time fetch failure" — a related class of timer/visibility issues.

---

## Other Areas Examined (No New Issues)

### Recently Modified Files
- `src/components/submission-list-auto-refresh.tsx` — Proper cleanup, backoff, visibility handling. No issues.
- `src/lib/api/client.ts` — `apiFetchJson` and `parseApiResponse` helpers are well-designed. No issues.
- `src/components/contest/export-button.tsx` — AbortController and blob URL cleanup are correct. No issues.
- `src/lib/auth/sign-out.ts` — Key snapshot before iteration correctly prevents races. No issues.
- `src/app/(dashboard)/dashboard/admin/error.tsx` — Dev-only logging, proper translations. No issues.
- `src/app/(public)/contests/[id]/layout.tsx` — Event listener cleanup is correct. No issues.

### Security
- `sanitizeHtml` uses DOMPurify with narrow allowlists. No issues.
- `safeJsonForScript` properly escapes `</script`, `<!--`, U+2028, U+2029. No issues.
- No new XSS vectors found.

### Known Deferred Issues (Still Present, No Change)
- DEFER-22: `.json()` before `response.ok` — 60+ instances (not new)
- DEFER-28: `as { error?: string }` pattern — 22+ instances (not new)
- DEFER-36: `formData.get()` cast assertions — several instances (not new)
- DEFER-46: `error.message` as control-flow discriminator — 15+ instances (not new)

---

## Final Sweep

No additional issues found in commonly missed areas:
- No race conditions in recently changed async code
- No resource leaks in timer/interval usage
- No new unguarded JSON.parse calls in critical paths
- No type safety regressions in recently modified files
