# Cycle 46 Review Remediation Plan

**Date:** 2026-05-10
**Based on:** `.context/reviews/_aggregate.md` (cycle 46)
**HEAD:** (current)

---

## Completed Tasks

### Task 1: Fix timer leak in Docker client `callWorkerJson`/`callWorkerNoContent` (C46-1) — COMPLETED

**Severity:** LOW
**Files:**
- `src/lib/docker/client.ts` — add `cleanupWithTimeout` in `callWorkerJson` and `callWorkerNoContent`

**Description:**
`callWorkerJson` and `callWorkerNoContent` wrap optional caller-provided `AbortSignal` with `withTimeout()` before passing to `fetch()`. When `fetch()` completes before the timeout expires, the timer is never cleaned up because neither function calls `cleanupWithTimeout()`. This is the same `withTimeout` timer leak pattern that was fixed in `apiFetch` during cycle 45.

**Implementation:**
1. In `callWorkerJson`: store the combined signal, pass it to `fetch()`, and chain `.finally(() => cleanupWithTimeout(signal))` when a custom signal was provided.
2. In `callWorkerNoContent`: apply the same pattern.

**Verification:**
- `npx tsc --noEmit` — passed
- `npx eslint src/lib/docker/client.ts` — passed

---

### Task 2: Fix `useVisibilityPolling` permanent break on callback exception (C46-2) — COMPLETED

**Severity:** LOW
**File:** `src/hooks/use-visibility-polling.ts`

**Description:**
The `scheduleNext()` function calls `tick()` synchronously inside a `setTimeout` callback, then recursively calls `scheduleNext()`. If `tick()` throws an exception, the exception propagates past `scheduleNext()`, the recursion breaks, and polling stops permanently.

**Implementation:**
1. Wrap `tick()` in a try/catch inside the `setTimeout` callback in `scheduleNext()`.
2. Call `scheduleNext()` in both the success and catch paths so polling continues even after a callback error.

**Verification:**
- `npx tsc --noEmit` — passed
- `npx eslint src/hooks/use-visibility-polling.ts` — passed

---

## Carry-Forward Deferred Items (unchanged)

All deferred items from cycles 25-41 remain unchanged. See `_aggregate-cycle-48.md` and prior cycle plans for the full list.

---

## Archive Notes

- `plans/open/2026-05-10-cycle-45-review-remediation.md` — cycle 45 had 2 findings, both now in this plan; archive after implementation
