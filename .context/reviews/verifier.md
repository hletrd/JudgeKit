# Verifier Review — Cycle 34

**Reviewer:** verifier
**Date:** 2026-05-10
**Scope:** Evidence-based correctness check against stated behavior

---

## Findings

### C34-VR-1: [MEDIUM] `apiFetchJson` documentation claims "safe wrapper" but silently swallows parse errors

**File:** `src/lib/api/client.ts:126-149`
**Confidence:** HIGH

The documentation at line 98-101 states: "Both success and error response JSON parsing is wrapped in `.catch()`, ensuring non-JSON bodies never throw SyntaxError." This is accurate. However, the complete absence of any logging when parsing fails contradicts the broader module convention documented at line 20: "Never silently swallow errors — always surface them to the user."

**Evidence:** Lines 138-144 catch parse errors with an empty catch block.

**Fix:** Add development-only console.warn in the catch block.

---

### C34-VR-2: [MEDIUM] `startRateLimitEviction` creates uncontrolled background process

**File:** `src/lib/security/rate-limit.ts:68-80`
**Confidence:** HIGH

The function creates a `setInterval` and stores it in a module-level variable. There is no exported function to stop it. This contradicts standard Node.js patterns where intervals should be stoppable.

**Evidence:** Lines 68-80 define `startRateLimitEviction` with no corresponding stop function.

**Fix:** Export `stopRateLimitEviction()`.

---

### C34-VR-3: [LOW] `anti-cheat-monitor` heartbeat continues scheduling while hidden

**File:** `src/components/exam/anti-cheat-monitor.tsx:185-191`
**Confidence:** MEDIUM

The heartbeat timer always reschedules itself regardless of document visibility. While the actual event send is skipped when hidden, the timer chain continues. This wastes timer callbacks during long hidden periods.

**Evidence:** Line 190 calls `scheduleHeartbeat()` unconditionally after the visibility check at line 187.

**Fix:** Only reschedule when visible.

---

## Previously Verified (cycle 33 fixes)

- C33-VR-1 (apiFetchJson fetch throw): **FIXED** — try/catch added around apiFetch call
- C33-VR-2 (visibility check timing): **FIXED** — `mountedRef` guard handles cleanup properly
- C33-VR-3 (Content-Disposition regex): Unchanged — still uses simple regex

## Positive Observations

1. `apiFetchJson` fetch error handling now matches documentation (cycle 33 fix verified).
2. Error boundaries all gate `console.error` behind development check.
3. Sign-out correctly snapshots keys before iteration.
