# Performance Review — Cycle 19/100

**Reviewer:** perf-reviewer (manual)
**Date:** 2026-05-08
**HEAD:** 18b479ac
**Scope:** Runtime performance, memory leaks, re-render optimization, UI responsiveness

---

## NEW FINDINGS

### C19-PR-1: [LOW] ContestReplay NaN-speed timer tight-loop risk

**Severity:** LOW
**Confidence:** MEDIUM
**File:** `src/components/contest/contest-replay.tsx:88-99, 214`

**Problem:** If playback `speed` becomes `NaN` (see C19-CR-2 / C19-SR-1), the `setTimeout` delay at line 99 becomes `NaN`, which browsers treat as 0ms. The callback immediately increments `currentIndex` and reschedules, creating a synchronous-tight-loop of state updates that starves the main thread. INP (Interaction to Next Paint) would spike, and the tab would become unresponsive.

**Fix:** Validate speed on input and add a guard in `scheduleNext`:
```tsx
const delay = Math.max(100, 1400 / speed);
```

---

## No Other Confirmed Issues

- `useVisibilityPolling` correctly uses recursive `setTimeout` with cleanup; no interval leaks.
- `useSourceDraft` properly batches localStorage writes with debouncing and visibility-based flush.
- Language-config-table uses separate AbortController refs per operation type (fixed in prior cycle).
- Compiler-client correctly prevents concurrent runs via `runningTestCaseId` guard.
- No unnecessary object/array recreation in render paths observed.
