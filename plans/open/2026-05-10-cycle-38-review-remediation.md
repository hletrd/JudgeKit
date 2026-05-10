# Cycle 38 Review Remediation Plan

**Date:** 2026-05-10
**Based on:** `.context/reviews/_aggregate.md` (cycle 38)
**HEAD:** d9af002b

---

## Active Tasks

### Task 1: Fix anti-cheat monitor heartbeat stopping after tab switch

**Severity:** LOW
**File:** `src/components/exam/anti-cheat-monitor.tsx:190-191`
**Finding:** AGG-1

**Description:**
The `scheduleHeartbeat` timer callback gates the reschedule on `document.visibilityState === "visible"`. When the tab is hidden and the timer fires, no reschedule happens. When the tab becomes visible again, `handleVisibilityChange` sends an immediate heartbeat but does not restart the timer. Heartbeats permanently stop after any tab-switch cycle.

**Implementation Steps:**
1. Modify the timer callback in `scheduleHeartbeat` to always call `scheduleHeartbeat()` at the end, regardless of visibility state.
2. Keep the heartbeat-send gated on visibility (only send when visible).
3. Verify the fix by examining the code flow:
   - Tab hidden -> timer fires -> no heartbeat sent -> timer rescheduled
   - Tab visible -> timer fires -> heartbeat sent -> timer rescheduled
   - Tab visible after hidden -> `handleVisibilityChange` sends immediate heartbeat -> existing timer continues

**Expected Code Change:**
```ts
// Before (buggy):
heartbeatTimerRef.current = setTimeout(async () => {
  if (!isHeartbeatActiveRef.current) return;
  if (document.visibilityState === "visible") {
    await reportEventRef.current("heartbeat");
  }
  if (document.visibilityState === "visible") {
    scheduleHeartbeat();
  }
}, HEARTBEAT_INTERVAL_MS);

// After (fixed):
heartbeatTimerRef.current = setTimeout(async () => {
  if (!isHeartbeatActiveRef.current) return;
  if (document.visibilityState === "visible") {
    await reportEventRef.current("heartbeat");
  }
  scheduleHeartbeat();  // always reschedule
}, HEARTBEAT_INTERVAL_MS);
```

**Verification:**
- [x] Code compiles (`npx tsc --noEmit`) — 0 errors
- [x] ESLint passes (`npx eslint src/components/exam/anti-cheat-monitor.tsx`) — 0 errors
- [x] Component tests pass (`npx vitest run --config vitest.config.component.ts tests/component/anti-cheat-monitor.test.tsx`) — 1 passed
- [x] All gates pass — eslint, tsc, vitest run (317 files/2391 tests), vitest run --config vitest.config.component.ts (68 files/208 tests), next build

**Status:** DONE

---

## Actions Taken This Cycle

1. **Archived completed plans:**
   - `plans/open/2026-05-09-cycle-37-review-remediation.md` -> `plans/closed/`
   - `plans/open/2026-05-10-cycle-36-review-remediation.md` -> `plans/closed/`

2. **Verified all prior cycle fixes:**
   - Cycle 37 (4 findings): ALL FIXED
   - Cycle 36 (6 findings): ALL FIXED
   - Cycle 35 (4 findings): ALL FIXED
   - Cycle 34 (3 findings): ALL FIXED (with regression noted in AGG-1)
   - Cycle 33 (3 findings): ALL FIXED
   - Cycle 32 (2 findings): ALL FIXED

3. **Ran quality gates:** All pass
   - `npx eslint .` — 0 errors
   - `npx tsc --noEmit` — 0 errors
   - `npx vitest run` — 317 files, 2391 tests (all pass)
   - `npx vitest run --config vitest.config.component.ts` — 68 files, 208 tests (all pass)

---

## Carry-Forward Deferred Items (unchanged)

### CRITICAL (requires architecture/product decision)
- **C-1**: Test/Seed localhost check spoofable — requires architecture review
- **C-2**: Accepted solutions endpoint unauthenticated — requires product decision
- **C-3**: File DELETE CSRF ordering — requires API refactor

### HIGH
- **H-1**: SSE result visibility bypass — requires SSE sanitization refactor

### MEDIUM
- **DEFER-C30-4**: `.json()` before `.ok` in non-critical components (30+ files) — large refactor
- **DEFER-C30-5**: Raw API error strings without i18n (ongoing incremental)
- **DEFER-C30-6**: `as { error?: string }` unsafe type assertions (15 instances)
- **C29 AGG-10**: Admin routes bypass createApiHandler (partially fixed, 15 routes remain)
- **C29 AGG-12**: Recruiting validate endpoint token brute-force (mitigated by rate limit + format validation)

### LOW
- **DEFER-27**: Missing AbortController on polling fetches
- **DEFER-34**: Hardcoded English fallback strings
- **DEFER-35**: Hardcoded English strings in editor title attributes
- **DEFER-36**: `formData.get()` cast assertions without validation
- **C25-6**: Client-side console.error (remaining instances)
- **C25-7**: WeakMap complexity in api-rate-limit.ts
- **C29 AGG-13**: files/[id] GET selects storedName
- **C29 AGG-14**: Admin settings exposes DB host/port
- **C29 AGG-15**: Missing error boundaries
- **C29 AGG-17**: Hardcoded English in throw new Error (permissions.ts)
- **C29 AGG-18**: Hardcoded English fallback strings in code-editor.tsx
- **C29 AGG-19**: formData.get() cast assertions without validation

---

## Exit Criteria for Deferred Items

See individual cycle plans for specific exit criteria. General rules:
- **CRITICAL/HIGH**: Require explicit architecture/product decision before deferral expiry
- **MEDIUM**: Should be addressed in dedicated refactoring cycles
- **LOW**: Address opportunistically during feature work or when file is touched
