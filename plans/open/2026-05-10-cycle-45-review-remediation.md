# Cycle 45 Review Remediation Plan

**Date:** 2026-05-10
**Based on:** `.context/reviews/_aggregate.md` (cycle 45)
**HEAD:** 682f2d77

---

## Completed Tasks

### Task 1: Fix timer leak in `withTimeout` (C45-1) — COMPLETED

**Severity:** LOW
**Files:**
- `src/lib/abort.ts` — add `cleanupWithTimeout` export
- `src/lib/api/client.ts` — call cleanup in `.finally()` when custom signal is provided

**Description:**
When `apiFetch` is called with a custom `AbortSignal`, `withTimeout` creates a timer that fires after 30s to abort the combined controller. If `fetch()` completes before the timeout, the timer is never cleaned up, leaving a dangling timer.

**Implementation:**
1. Added `timeoutCleanups` WeakMap and `cleanupWithTimeout(signal)` export to `src/lib/abort.ts:15-34`
2. Updated `withTimeout` to store a cleanup function (only clears timer, preserves abort listener) at `src/lib/abort.ts:70`
3. Updated `apiFetch` in `src/lib/api/client.ts:90-97` to chain `.finally(() => cleanupWithTimeout(signal))` when a custom signal is provided

**Verification:**
- `npx tsc --noEmit` — passed
- `npx eslint src/lib/abort.ts src/lib/api/client.ts` — passed
- `npx vitest run tests/unit/api/client.test.ts` — 14/14 passed

---

### Task 2: Fix code snapshot timer race on unmount (C45-2) — COMPLETED

**Severity:** LOW
**File:** `src/components/problem/problem-submission-form.tsx`

**Description:**
The recursive `tick` function in the code snapshot `useEffect` schedules the next timer after `apiFetch` resolves. If the component unmounts during this window, the new timer leaks.

**Implementation:**
1. Added `isMountedRef` boolean ref at `src/components/problem/problem-submission-form.tsx:95`
2. Added mount/unmount useEffect at lines 97-102 to set `isMountedRef.current`
3. Added `if (!isMountedRef.current) return;` guard in `tick` before scheduling next timer at line 131

**Verification:**
- `npx tsc --noEmit` — passed
- `npx eslint src/components/problem/problem-submission-form.tsx` — passed

---

## Carry-Forward Deferred Items (unchanged)

All deferred items from cycles 25-41 remain unchanged. See `_aggregate-cycle-48.md` and prior cycle plans for the full list.

---

## Archive Notes

- `plans/open/2026-05-10-cycle-42-review-remediation.md` — cycle 42 had 0 findings, archive after this cycle
- `plans/open/2026-05-10-cycle-40-review-remediation.md` — cycle 40 findings all fixed, archive after this cycle
