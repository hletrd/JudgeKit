# Tracer Review — Cycle 14/100

**Reviewer:** tracer (manual)
**Date:** 2026-05-08
**HEAD:** fe8f8866
**Scope:** Causal tracing of suspicious flows identified by other reviewers

---

## NEW FINDINGS

### TRC-1: [LOW] CopyCodeButton rapid-click trace to premature state reset

**File:** `src/components/code/copy-code-button.tsx`

**Causal trace:**
1. User clicks copy button at t=0
2. `handleCopy` sets `copied = true` and creates `setTimeout(timer1, 2000)`
3. User clicks copy button again at t=500ms
4. `handleCopy` sets `copied = true` (no-op, already true) and creates `setTimeout(timer2, 2000)`
5. `copiedTimer.current` now points to `timer2`; `timer1` is orphaned
6. At t=2000ms, `timer1` fires and calls `setCopied(false)`
7. Checkmark disappears even though only 1500ms have passed since the last click
8. At t=2500ms, `timer2` fires and calls `setCopied(false)` again (no-op)
9. If component unmounted at t=1500ms, cleanup only clears `timer2`; `timer1` fires on unmounted component

**Root cause:** Missing `clearTimeout(copiedTimer.current)` before line 26.

**Fix:** Add the clear step.

### TRC-2: [MEDIUM] Language admin build/remove collision trace

**File:** `src/app/(dashboard)/dashboard/admin/languages/language-config-table.tsx`

**Causal trace:**
1. Admin clicks "Build" on `judge-haskell` at t=0
2. `handleBuild` aborts any existing controller (none), creates `controller1`
3. POST to `/api/v1/admin/docker/images/build` with `signal: controller1.signal`
4. Build takes ~3 minutes due to large image size
5. At t=60s, admin clicks "Remove" on `judge-python`
6. `confirmRemoveImage` aborts `abortControllerRef.current` (which is `controller1`)
7. Build request receives `AbortError` and shows "buildError" toast
8. Admin is confused — they did not cancel the build

**Root cause:** Single shared AbortController for unrelated operations.

**Fix:** Use separate refs or a map of controllers.

## Traces attempted but ruled out

- **Compiler-client mount effect:** The `exhaustive-deps` suppression is justified — the effect is intentionally mount-only and all referenced values are stable.
- **Submission-detail-client timer overlap:** The sequential `schedule()` pattern prevents parallel poll calls; cleanup correctly handles unmount mid-poll.
